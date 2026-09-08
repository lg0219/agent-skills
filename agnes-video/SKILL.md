---
name: agnes-video
description: Generate videos using Agnes Video V2.0 model (agnes-video-v2.0). Supports text-to-video, image-to-video, and keyframe animation. Invoke when user wants to create videos from text, images, or keyframes.
---

# Agnes Video V2.0 Skill

使用 Agnes Video V2.0 生成视频。API 是异步的：先创建任务，再轮询结果。

## 触发条件

1. 用户要求生成视频
2. 用户要求根据文字描述制作视频
3. 用户要求将图片变成视频
4. 用户要求关键帧动画过渡

## 使用方式

调用 CLI 脚本：

```bash
# 文生视频
python3 /root/.openclaw/workspace/skills/agnes-video/scripts/agnes_video_cli.py \
  -p "描述文字" -n 视频名 -d 5

# 图生视频
python3 /root/.openclaw/workspace/skills/agnes-video/scripts/agnes_video_cli.py \
  -p "描述" -n 视频名 -i "https://example.com/image.jpg" -d 5

# 关键帧动画
python3 /root/.openclaw/workspace/skills/agnes-video/scripts/agnes_video_cli.py \
  -p "过渡描述" -n 视频名 -k "url1" "url2" -d 5
```

## 环境变量

- `AGNES_VIDEO_API_KEY` — API Key（已在 ~/.bashrc 配置）
- `AGNES_VIDEO_API_BASE` — API 地址（默认 https://api.agnes-ai.cn）
- `AGNES_VIDEO_OUTPUT_DIR` — 视频保存目录（默认 /var/www/html/video）

## 参数

| 参数 | 说明 |
|------|------|
| `-p, --prompt` | 视频描述（必填） |
| `-n, --name` | 视频文件名（默认 video） |
| `-i, --image` | 图生视频图片 URL |
| `-k, --keyframes` | 关键帧图片 URL 列表 |
| `-d, --duration` | 视频时长秒数（自动算帧数） |
| `-m, --model` | 模型名（默认 agnes-video-v2.0） |
| `--width / --height` | 分辨率（默认 1152x768） |
| `--negative-prompt` | 反向提示词 |
| `--seed` | 随机种子 |
| `-t, --max-wait` | 最大等待秒数（默认 300） |
| `--no-save` | 不下载到本地 |
| `-q, --query` | 查询任务状态 |

## 输出

成功时返回 JSON：
```json
{
  "status": "completed",
  "task_id": "task_xxx",
  "video_id": "video_xxx",
  "video_url": "https://platform-outputs.agnes-ai.space/videos/...",
  "local_path": "/var/www/html/video/视频名.mp4",
  "http_url": "http://192.168.1.16/video/视频名.mp4",
  "size": "1088x832",
  "seconds": "5.0"
}
```

## 视频访问

- 本地路径：`/var/www/html/video/<name>.mp4`
- HTTP 地址：`http://192.168.1.16/video/<name>.mp4`

## 提示词结构

`[主体] + [动作] + [场景] + [镜头运动] + [光线] + [风格]`

示例：
```
A young astronaut walking across a red desert planet, dust blowing in the wind,
slow cinematic tracking shot, dramatic sunset lighting, realistic sci-fi style
```

## 时长参考

| 时长 | 推荐 duration |
|------|-------------|
| ~3秒 | -d 3 |
| ~5秒 | -d 5 |
| ~10秒 | -d 10 |
| ~18秒 | -d 18（上限） |

帧数自动计算，遵循 8n+1 规则。
