# Dilreet

Dilreet is a Windows app that runs AI on your own PC. It does three things:

- **Chat**, in an interface like Claude's.
- **Pictures and videos** from a sentence.
- **New features for itself**, built when you ask.

On first launch Dilreet scans your hardware, recommends models that fit it, and downloads everything automatically. After that it works offline.

## Get the .exe (one-time, about 10 minutes)

You don't need to install anything on your PC to build it. GitHub builds the installer for you.

1. Create a new repository on GitHub named `dilreet`. It can be private.
2. Upload this whole folder to it. Either drag the files into GitHub's "Upload files" page, or run:
   ```
   git init
   git add .
   git commit -m "Dilreet"
   git branch -M main
   git remote add origin https://github.com/<your-username>/dilreet.git
   git push -u origin main
   ```
   If you use "Upload files", make sure the hidden `.github` folder goes up too. Drag in the folder's contents rather than picking files one by one.
3. Open the **Actions** tab. When "Build Dilreet for Windows" turns green, open that run and download **Dilreet-Setup** under *Artifacts*. Unzip it to get `Dilreet-Setup-1.0.0.exe`.
4. Run the installer. Windows SmartScreen will warn you because the app isn't code-signed. Click **More info → Run anyway**.

## Updating Dilreet itself

There are two kinds of update.

**Add-on features (no rebuild).** Ask in chat, for example *"add a feature: an expense tracker"*. Or open **Add a feature**. The local coding model writes the feature and you get a live preview. Install it if you like it, or describe changes and try again. Each feature keeps every version so you can roll back.

Add-ons run in a locked frame. They can't read your files or reach the internet. They can only:

- ask Dilreet's chat model questions
- save their own data
- show a message in the app

**Core updates (new versions of the app).** Change the code in your repository and push a version tag:
```
git tag v1.0.1
git push origin v1.0.1
```
GitHub builds a release. Installed copies of Dilreet download it automatically and show a "Restart to update" button. You can also check from **Settings → Check for updates**.

## What runs on which PC

| | Chat | Pictures | Videos |
|---|---|---|---|
| No GPU / under 4 GB VRAM | small models | slow | no |
| 4 GB VRAM (e.g. GTX 1650) | Qwen 3 4B | Stable Diffusion 1.5 | experimental (Wan 2.1 1.3B, tiny clips) |
| 6–8 GB VRAM, 16 GB RAM | Qwen 3 8B | SDXL Turbo | slow |
| 8–12 GB VRAM | Gemma 3 12B | SDXL | Wan 2.1 1.3B |
| 12 GB+ VRAM | Qwen 3 14B | SDXL | Wan 2.2 5B |

The **AI models** page lets you download, switch or remove any model. You can also type any model name from [ollama.com/library](https://ollama.com/library).

## How it works

| Part | What it uses |
|---|---|
| App | Electron + React, packaged as an NSIS installer |
| Chat and coding models | [Ollama](https://ollama.com), downloaded portable into Dilreet's folder |
| Pictures and video | [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) (CUDA build for NVIDIA, Vulkan for AMD/Intel) |
| Video files | FFmpeg, which converts the frames to MP4 |
| Storage | `C:\Users\<you>\Dilreet` by default (changeable in Settings) |

Folder layout:

```
electron/          main process
  main.js          window, secure protocols, every action the UI can call
  hardware.js      CPU / RAM / GPU / VRAM detection and the PC "tier"
  catalog.js       models Dilreet knows, with hardware requirements and download links
  engines.js       installs and starts Ollama, stable-diffusion.cpp, FFmpeg
  ollama.js        chat streaming, model downloads
  agent.js         chat agent with tools (create_image, create_video, add_feature, pc_info)
  studio.js        picture and video generation, gallery
  features.js      self-extension: drafts, safety checks, versions, rollback
  downloader.js    resumable downloads, GitHub release lookup, unzip
src/               interface (React)
.github/workflows  builds the .exe on GitHub
```

## Developing on your PC (optional)

You need Node.js 22.

```
npm install
npm run dev     # opens Dilreet with live reload
npm run dist    # builds release/Dilreet-Setup-x.y.z.exe locally
```

## Notes

- Model downloads resume where they stopped. Pause or retry them from the Activity panel at the bottom right.
- While a picture or video is being made, Dilreet unloads the chat model from the GPU. This gives the picture or video all of the GPU's memory.
- Some Hugging Face models need you to accept a licence in the browser first. If a download fails with 401/403, open the model's Hugging Face page and accept it.
