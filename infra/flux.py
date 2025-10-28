import time
from io import BytesIO
from pathlib import Path

import modal

cuda_version = "12.4.0"  # should be no greater than host CUDA version
flavor = "devel"  # includes full CUDA toolkit
operating_sys = "ubuntu22.04"
tag = f"{cuda_version}-{flavor}-{operating_sys}"

cuda_dev_image = modal.Image.from_registry(
    f"nvidia/cuda:{tag}", add_python="3.11"
).entrypoint([])

diffusers_commit_sha = "dbe413668dbf9d527944b51ef5f99a60b36a90be"

flux_image = (
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
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HUB_CACHE": "/cache"})
)

flux_image = flux_image.env(
    {
        "TORCHINDUCTOR_CACHE_DIR": "/root/.inductor-cache",
        "TORCHINDUCTOR_FX_GRAPH_CACHE": "1",
    }
)

app = modal.App("example-flux", image=flux_image)

with flux_image.imports():
    import torch
    from diffusers import DiffusionPipeline, FluxPipeline


MINUTES = 60  # seconds
VARIANT = "schnell"  # or "dev"
NUM_INFERENCE_STEPS = 4  # use ~50 for [dev], smaller for [schnell]


@app.cls(
    gpu="H100",  # fast GPU with strong software support
    scaledown_window=20 * MINUTES,
    timeout=60 * MINUTES,  # leave plenty of time for compilation
    volumes={  # add Volumes to store serializable compilation artifacts, see section on torch.compile below
        "/cache": modal.Volume.from_name("hf-hub-cache", create_if_missing=True),
        "/root/.nv": modal.Volume.from_name("nv-cache", create_if_missing=True),
        "/root/.triton": modal.Volume.from_name("triton-cache", create_if_missing=True),
        "/root/.inductor-cache": modal.Volume.from_name(
            "inductor-cache", create_if_missing=True
        ),
    },
    secrets=[modal.Secret.from_name("huggingface-secret")],
)
class Model:
    compile: bool = (  # see section on torch.compile below for details
        modal.parameter(default=False)
    )

    @modal.enter()
    def enter(self):
        # pipe = DiffusionPipeline.from_pretrained("Wan-AI/Wan2.2-T2V-A14B-Diffusers").to("cuda")
        pipe = FluxPipeline.from_pretrained(
            f"black-forest-labs/FLUX.1-{VARIANT}", dtype=torch.bfloat16
        ).to("cuda")  # move model to GPU
        self.pipe = optimize(pipe, compile=self.compile)


    @modal.method()
    def inference(self, prompt: str) -> bytes:
        print("🎨 generating image...")
        out = self.pipe(
            prompt,
            output_type="pil",
            num_inference_steps=NUM_INFERENCE_STEPS,
        ).images[0]

        byte_stream = BytesIO()
        out.save(byte_stream, format="JPEG")
        return byte_stream.getvalue()


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

@app.local_entrypoint()
def main(
    prompt: str = "A scottish terrier wandering around a futuristic city, digital art",
    twice: bool = True,
    compile: bool = False,
):
    t0 = time.time()
    image_bytes = Model(compile=compile).inference.remote(prompt)
    print(f"🎨 first inference latency: {time.time() - t0:.2f} seconds")

    if twice:
        t0 = time.time()
        image_bytes = Model(compile=compile).inference.remote(prompt)
        print(f"🎨 second inference latency: {time.time() - t0:.2f} seconds")

    output_path = Path("/tmp") / "flux" / "output.jpg"
    output_path.parent.mkdir(exist_ok=True, parents=True)
    print(f"🎨 saving output to {output_path}")
    output_path.write_bytes(image_bytes)