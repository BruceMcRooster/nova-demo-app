from datetime import datetime
import time
from io import BytesIO
from pathlib import Path
from fastapi.responses import FileResponse, StreamingResponse
import torch
import numpy as np
from diffusers import WanPipeline, AutoencoderKLWan, WanTransformer3DModel, UniPCMultistepScheduler
from diffusers.utils import export_to_video, load_image
import modal

cuda_version = "12.4.0"  # should be no greater than host CUDA version
flavor = "devel"  # includes full CUDA toolkit
operating_sys = "ubuntu22.04"
tag = f"{cuda_version}-{flavor}-{operating_sys}"

VOLUME_NAME = "wan2-outputs"
OUTPUTS_PATH = Path("/outputs")  # remote path for saving video outputs
outputs = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)


cuda_dev_image = modal.Image.from_registry(
    f"nvidia/cuda:{tag}", add_python="3.11"
).entrypoint([])

diffusers_commit_sha = "dbe413668dbf9d527944b51ef5f99a60b36a90be"

wan2_image = (
    cuda_dev_image.apt_install(
        "git",
        "libglib2.0-0",
        "libsm6",
        "libxrender1",
        "libxext6",
        "ffmpeg",
        "libgl1",
    )
    .pip_install(
        "invisible_watermark==0.2.0",
        "transformers",
        "huggingface_hub[hf_transfer]",
        "accelerate==0.33.0",
        "safetensors==0.4.4",
        "sentencepiece==0.2.0",
        "torch==2.5.0",
        f"git+https://github.com/huggingface/diffusers.git",
        "numpy<2",
        "hf_transfer",
        "ftfy",
        "imageio",
        "imageio-ffmpeg",
        "fastapi[standard]"
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HUB_CACHE": "/cache"})
)

wan2_image = wan2_image.env(
    {
        "TORCHINDUCTOR_CACHE_DIR": "/root/.inductor-cache",
        "TORCHINDUCTOR_FX_GRAPH_CACHE": "1",
    }
)

app = modal.App("example-wan2", image=wan2_image)

with wan2_image.imports():
    import torch
    from diffusers import DiffusionPipeline


MINUTES = 60  # seconds
VARIANT = "schnell"  # or "dev"
NUM_INFERENCE_STEPS = 4  # use ~50 for [dev], smaller for [schnell]


@app.cls(
    gpu="H200",  # fast GPU with strong software support
    scaledown_window= 2 * MINUTES,
    timeout=5 * MINUTES,  # leave plenty of time for compilation
    volumes={  # add Volumes to store serializable compilation artifacts, see section on torch.compile below
        "/cache": modal.Volume.from_name("hf-hub-cache", create_if_missing=True),
        "/root/.nv": modal.Volume.from_name("nv-cache", create_if_missing=True),
        "/root/.triton": modal.Volume.from_name("triton-cache", create_if_missing=True),
        "/root/.inductor-cache": modal.Volume.from_name(
            "inductor-cache", create_if_missing=True
        ),
        OUTPUTS_PATH: outputs,  # videos will be saved to a distributed volume
    },
    secrets=[modal.Secret.from_name("huggingface-secret")],
)
class Model:
    compile: bool = (  # see section on torch.compile below for details
        modal.parameter(default=False)
    )

    @modal.enter()
    def enter(self):
        dtype = torch.bfloat16
        device = "cuda"
        model_id = "Wan-AI/Wan2.2-T2V-A14B-Diffusers"
        vae = AutoencoderKLWan.from_pretrained(model_id, subfolder="vae", torch_dtype=torch.float32)
        self.pipe = WanPipeline.from_pretrained(model_id, vae=vae, torch_dtype=dtype)
        self.pipe.to(device)



    @modal.method()
    def inference(self, prompt: str) -> bytes:
        print(f"🎨 generating video with prompt: {prompt}")

        height = 704
        width = 1280
        num_frames = 121
        num_inference_steps = 50
        guidance_scale = 5.0
        negative_prompt = "lowres, bad anatomy, error body, error arm, error hand, error fingers, error legs, error feet, missing fingers"
        output = self.pipe(
            prompt=prompt,
            negative_prompt=negative_prompt,
            height=height,
            width=width,
            num_frames=num_frames,
            guidance_scale=guidance_scale,
            num_inference_steps=num_inference_steps,
        ).frames[0]
        print("🎨 generation complete, exporting video...")
        filename = f"output_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
        export_to_video(output, f"/outputs/{filename}", fps=24)
        return filename



def optimize(pipe, compile=True):
    # fuse QKV projections in Transformer and VAE
    pipe.transformer.fuse_qkv_projections()
    pipe.vae.fuse_qkv_projections()

    # switch memory layout to Torch's preferred, channels_last
    pipe.transformer.to(memory_format=torch.channels_last)
    pipe.vae.to(memory_format=torch.channels_last)

    if not compile:
        return pipe

    # set torch compile flags
    config = torch._inductor.config
    config.disable_progress = False  # show progress bar
    config.conv_1x1_as_mm = True  # treat 1x1 convolutions as matrix muls
    # adjust autotuning algorithm
    config.coordinate_descent_tuning = True
    config.coordinate_descent_check_all_directions = True
    config.epilogue_fusion = False  # do not fuse pointwise ops into matmuls

    # tag the compute-intensive modules, the Transformer and VAE decoder, for compilation
    pipe.transformer = torch.compile(
        pipe.transformer, mode="max-autotune", fullgraph=True
    )
    pipe.vae.decode = torch.compile(
        pipe.vae.decode, mode="max-autotune", fullgraph=True
    )

    # trigger torch compilation
    print("🔦 running torch compilation (may take up to 20 minutes)...")

    pipe(
        "dummy prompt to trigger torch compilation",
        output_type="pil",
        num_inference_steps=NUM_INFERENCE_STEPS,  # use ~50 for [dev], smaller for [schnell]
    ).images[0]

    print("🔦 finished torch compilation")

    return pipe
model = Model()
@app.local_entrypoint()
def main(
    prompt: str = "A black scottish terrier (scottie dog) wandering around a steampunk city, hyperrealistic, 4k",
    compile: bool = False,
):
    pass
    # video_filename = model.inference.remote(prompt)

    # output_path = Path("/tmp") / "wan2" / "output.mp4"
    # output_path.parent.mkdir(exist_ok=True, parents=True)
    # print(f"🎨 saving output to {output_path}")
    # out_bytes = outputs.read_file(video_filename)
    # with open(output_path, "wb") as f:
    #     for chunk in out_bytes:
    #         f.write(chunk)
    # print(f"🎨 saved output to {output_path}")

def read_file_chunks(filename: str):
    vol = modal.Volume.from_name("wan2-outputs")
    for chunk in vol.read_file(filename):
        yield chunk

@app.function()
@modal.fastapi_endpoint()
def generate_video_http(prompt: str) -> str:
    """Generate a video from a text prompt using WAN2 model and return the filename."""
    filename = model.inference.remote(prompt)
    # print(filename, str(filename))
    # filename = "output_20251018_023241.mp4"
    time.sleep(10)  # wait for the file to be ready
    return StreamingResponse(
        read_file_chunks(filename),
        media_type="video/mp4",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""}
    )