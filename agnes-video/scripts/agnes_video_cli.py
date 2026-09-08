#!/usr/bin/env python3
import asyncio, json, os, sys, argparse, httpx

API_KEY = os.getenv("AGNES_VIDEO_API_KEY") or os.getenv("AGNES_API_KEY")
API_BASE = os.getenv("AGNES_VIDEO_API_BASE", "https://api.agnes-ai.cn")
OUTPUT_DIR = os.getenv("AGNES_VIDEO_OUTPUT_DIR", "/var/www/html/video")

def calc_frames(duration, frame_rate=24):
    if duration:
        n = max(1, (duration * frame_rate - 1) // 8)
        return min(n * 8 + 1, 441)
    return 121

async def create_task(prompt, model, image, extra_images, mode, width, height, num_frames, frame_rate, negative_prompt, seed):
    body = {"model": model, "prompt": prompt, "height": height, "width": width, "num_frames": num_frames, "frame_rate": frame_rate}
    if image: body["image"] = image
    if mode == "keyframes" and extra_images: body["extra_body"] = {"image": extra_images, "mode": "keyframes"}
    if negative_prompt: body["negative_prompt"] = negative_prompt
    if seed is not None: body["seed"] = seed
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.post(f"{API_BASE}/v1/videos", headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}, json=body)
        r.raise_for_status()
        return r.json()

async def poll_result(video_id, max_wait=300, interval=5):
    url = f"{API_BASE}/agnesapi"
    elapsed = 0
    async with httpx.AsyncClient(timeout=30.0) as c:
        while elapsed < max_wait:
            r = await c.get(url, params={"video_id": video_id}, headers={"Authorization": f"Bearer {API_KEY}"})
            r.raise_for_status()
            data = r.json()
            if data.get("status") in ("completed", "failed"): return data
            await asyncio.sleep(interval); elapsed += interval
    return {"status": "timeout", "video_id": video_id}

async def download_video(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    async with httpx.AsyncClient(timeout=120.0) as c:
        r = await c.get(url, follow_redirects=True); r.raise_for_status()
        with open(dest, "wb") as f: f.write(r.content)

async def run_generate(prompt, name="video", model="agnes-video-v2.0", image=None, keyframes=None, width=1152, height=768, duration=None, negative_prompt=None, seed=None, max_wait=300, save_local=True):
    if not API_KEY: return {"status": "error", "error": "AGNES_VIDEO_API_KEY not set"}
    frame_rate, num_frames = 24, calc_frames(duration)
    mode = "keyframes" if keyframes else ("img2vid" if image else None)
    try:
        task_data = await create_task(prompt, model, image, keyframes, mode, width, height, num_frames, frame_rate, negative_prompt, seed)
        task_id, video_id = task_data.get("id",""), task_data.get("video_id","")
        result = await poll_result(video_id, max_wait)
        status = result.get("status", "unknown")
        if status == "completed":
            video_url = result.get("url") or result.get("metadata", {}).get("url", "")
            local_path, http_url = None, None
            if save_local and video_url:
                fname = f"{name}.mp4"
                local_path = os.path.join(OUTPUT_DIR, fname)
                await download_video(video_url, local_path)
                http_url = f"http://192.168.1.16/video/{fname}"
            return {"status": "completed", "task_id": task_id, "video_id": video_id, "video_url": video_url, "local_path": local_path, "http_url": http_url, "size": result.get("size"), "seconds": result.get("seconds", str(num_frames/frame_rate))}
        elif status == "failed": return {"status": "failed", "task_id": task_id, "video_id": video_id, "error": result.get("error")}
        else: return {"status": "timeout", "task_id": task_id, "video_id": video_id, "message": f"Use query_video('{video_id}') to check later"}
    except httpx.HTTPStatusError as e: return {"status": "error", "task_id": "", "error": f"HTTP {e.response.status_code}: {e.response.text[:200]}"}
    except Exception as e: return {"status": "error", "task_id": "", "error": str(e)}

async def run_query(video_id):
    if not API_KEY: return {"error": "AGNES_VIDEO_API_KEY not set"}
    async with httpx.AsyncClient(timeout=30.0) as c:
        r = await c.get(f"{API_BASE}/agnesapi", params={"video_id": video_id}, headers={"Authorization": f"Bearer {API_KEY}"})
        r.raise_for_status(); return r.json()

def main():
    parser = argparse.ArgumentParser(description="Agnes Video V2.0")
    parser.add_argument("--prompt", "-p", required=True)
    parser.add_argument("--name", "-n", default="video")
    parser.add_argument("--model", "-m", default="agnes-video-v2.0")
    parser.add_argument("--image", "-i", default=None)
    parser.add_argument("--keyframes", "-k", nargs="+", default=None)
    parser.add_argument("--width", type=int, default=1152)
    parser.add_argument("--height", type=int, default=768)
    parser.add_argument("--duration", "-d", type=int, default=None)
    parser.add_argument("--negative-prompt", default=None)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--max-wait", "-t", type=int, default=300)
    parser.add_argument("--no-save", action="store_true")
    parser.add_argument("--query", "-q", default=None)
    args = parser.parse_args()
    if args.query:
        print(json.dumps(asyncio.run(run_query(args.query)), indent=2, ensure_ascii=False))
        return
    r = asyncio.run(run_generate(prompt=args.prompt, name=args.name, model=args.model, image=args.image, keyframes=args.keyframes, width=args.width, height=args.height, duration=args.duration, negative_prompt=args.negative_prompt, seed=args.seed, max_wait=args.max_wait, save_local=not args.no_save))
    print(json.dumps(r, indent=2, ensure_ascii=False))

if __name__ == "__main__": main()
