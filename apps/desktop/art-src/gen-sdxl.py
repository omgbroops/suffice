# Generates the neon-mech backdrops (public/art/mech-*.png) locally with SDXL + IP-Adapter.
# Run from a folder holding style-ref.png (a style sample; not committed) with an out/ dir:
#   python gen-sdxl.py 13,21   -> out/v13.png, out/v21.png
# Same style, new picture: SDXL + IP-Adapter applied only to the style block (InstantStyle),
# so the reference supplies look and palette while the prompt supplies the subject.
import sys, torch
from diffusers import StableDiffusionXLPipeline
from PIL import Image
seeds = [int(s) for s in sys.argv[1].split(',')]
pipe = StableDiffusionXLPipeline.from_pretrained('stabilityai/stable-diffusion-xl-base-1.0', torch_dtype=torch.float16, variant='fp16', use_safetensors=True).to('mps')
pipe.load_ip_adapter('h94/IP-Adapter', subfolder='sdxl_models', weight_name='ip-adapter_sdxl.bin')
pipe.set_ip_adapter_scale({'up': {'block_0': [0.0, 1.0, 0.0]}})
ref = Image.open('style-ref.png')
prompt = ('extreme close-up of a colossal armored robot head in three-quarter profile, angular hard-surface armor plates, '
          'visor slit with one glowing magenta eye, cel-shaded digital painting, dark violet and maroon plates, '
          'bright neon magenta rim light and glowing magenta scratch lines along every plate edge, luminous teal cyan fog filling the right third, purple shards and debris below, high contrast, cinematic, painterly, no text')
neg = 'horn, text, watermark, logo, signature, cartoon, blurry, photo, human, face'
for s in seeds:
    img = pipe(prompt, negative_prompt=neg, ip_adapter_image=ref, width=1344, height=768, num_inference_steps=28,
               guidance_scale=6.0, generator=torch.Generator('cpu').manual_seed(s)).images[0]
    img.save(f'out/v{s}.png'); print('saved', s, flush=True)
