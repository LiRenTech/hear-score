# 听谱 Hearscore

一个纯前端的音乐扒谱原型：上传音频后，在浏览器中运行 Spotify Basic Pitch，逐段显示音符，并提供钢琴卷帘、原音和 MIDI 播放以及 MIDI 导出。另提供独立的「架子鼓」实验页面，支持打击乐提取、鼓件落点检测与同步试听。

## 本地启动

需要 Node.js 22.12+（推荐 Node.js 22 LTS）或 20.19+。

```bash
cd /Users/littlefean/Desktop/Projects/hear-score
npm install
npm run dev
```

打开终端显示的本地地址，默认是 http://127.0.0.1:5173。也可以双击项目里的 `启动听谱.command`。

```bash
npm test       # 音符拼接、WAV 和 MIDI 回归测试
npm run build # TypeScript 检查与生产构建
npm run preview # 预览构建产物
```

依赖安装后的 postinstall 脚本会把模型与 WASM 文件复制到 public；构建时随网站一起打包。模型不会从第三方 CDN 动态下载，不需要 API key、后端或付费服务。网页本身仍需要通过 HTTP 服务打开，不能直接双击 dist/index.html。

## 使用

1. 上传或拖入 MP3 / WAV；M4A、OGG、FLAC 的支持取决于浏览器解码器。当前限制为 50 MB、5 分钟。
2. 音频会解码、混为单声道、重采样至 22050 Hz，然后自动开始转录。首次使用加载本地模型；计算时间取决于设备。
3. 每处理约 6 秒音频会更新一次结果。可停止计算并保留已完成部分，或换文件取消旧任务。
4. 钢琴卷帘保留同时发声的音符。点击时间轴可跳转，空格播放或暂停，支持 0.5×、0.75×、1× 速度。生成音符后，可在播放器里切换「原音」和「MIDI」；MIDI 模式只播放当前过滤保留的音符。
5. 调整音符强度过滤和最短时长，无需重新运行模型。颜色代表模型响应强度，不是经过校准的置信概率。
6. MIDI 导出保留当前过滤后的多声部与秒级时序，JSON 保存参数和原始时间。停止或计算中导出的文件标为部分转录。
7. 也可直接选择或拖入 `.mid` / `.midi` 文件，打开后即可播放，无需识别。MIDI 使用浏览器内置合成音色，播放音高、力度和时序，不还原文件指定的乐器音色或控制器效果。文件同样限 5 分钟、50 MB。

## 架子鼓实验页面

点击顶部「架子鼓」，或直接打开 `/#/drums`。使用 hash 路由，因此静态托管无需额外的路径重写规则。切换页面会释放当前音频与任务，结果不会跨页面保存。

1. 上传或拖入音频（5 分钟、50 MB 上限与旋律页面一致），或点击「体验鼓与和弦示例」。示例包含 120 BPM 的合成鼓组及持续和弦，通过相同的解码、分离和检测流程。
2. 在 Worker 中进行谐波／打击乐分离（HPSS），生成可实际播放的打击乐音频。可以停止计算、换文件，或调整旋律抑制后重新提取。
3. 在「原音 / 提取鼓声」间切换试听，保留播放位置；支持半速、0.75 倍速和空格播放 / 暂停。
4. 原音波形、提取鼓声波形、对数频率频谱、五线谱落点及三个鼓件行共享时间轴与播放竖线。点击图面跳转，左右键微调 1 秒，Home / End 跳到首尾；支持缩放、全曲视图及播放时跟随滚动。
5. 落点过滤即时生效。BPM 与首拍位置用于手动 4/4 参考网格，不执行节拍估计或量化。五线谱上的符头表示敲击起点，暂不推断时值；不是可直接打印演奏的完整鼓谱。
6. 导出提取音频为单声道 22050 Hz WAV，或导出当前过滤后的鼓谱 MIDI。MIDI 使用 GM 打击乐通道 10（零起始 channel 9），底鼓 36、军鼓 38、镲类暂映射闭镲 42，保留秒级时间。

当前分离方法抑制持续的谐波成分，**不是专门训练的架子鼓分轨模型，无法保证只剩架子鼓**。可能保留人声辅音、钢琴起音、其他打击乐，并削弱鼓尾音。底鼓、军鼓、镲类通过频带起音启发式估计，可能错分或漏检；暂不细分通鼓、开闭镲、吊镲，也未用真实歌曲标注集评测准确率。需要更干净的歌曲鼓轨时，后续可接入专门的分轨模型。

算法采用独立实现的居中 STFT、双向中值滤波软掩码与归一化重叠相加，参考 [AudioLabs 的 Harmonic–Percussive Separation](https://www.audiolabs-erlangen.de/resources/MIR/FMP/C8/C8S1_HPS.html)。分批计算带上下文的频谱，避免为整首歌保存所有复数频谱；无新运行依赖、外部服务或模型下载。

## 能力边界

- 真实模型推理，不是根据文件名生成谱子。内置示例也会生成 WAV 后经过同一条解码 / 识别流程。
- Basic Pitch 更适合单一乐器、清晰独奏，支持复音，但不执行人声 / 乐器分轨。完整歌曲中的鼓声、混响、伴奏与人声可能造成错音、漏音或八度错误。
- 分块交界使用 0.5 秒上下文并合并连续音，仍可能误合并贴近边界的重复同音。
- 第一版没有音符拖拽编辑、MusicXML、PDF 导出、工程持久化。刷新页面会清空当前音频和结果。
- 支持现代桌面浏览器，推荐 Chrome / Edge；移动设备性能与内存可能限制长音频。WASM 失败时尝试 CPU 后端。
- 音频不发送到服务器。浏览器只请求站点静态资源、模型与 WASM 文件，无分析埋点、第三方字体或外部 API 请求。

## 实现结构

- React + TypeScript + Vite：界面与构建。
- Web Audio API：解码、混音、重采样、波形。
- `@spotify/basic-pitch` + TensorFlow.js / WASM：Worker 内复音识别。
- `@tonejs/midi`：MIDI 文件。
- `src/transcribe.worker.ts`：6 秒分块、上下文、推理及后台结果回传。每个块有 TensorFlow scope，限制 Basic Pitch 1.x 的中间张量占用。
- `src/lib/notes.ts`：分块拼接、过滤与导出。
- `src/lib/framing.ts`：与上游一致的补零分帧，修复 TFJS 3.x WASM Fill 的 dtype 兼容问题。
- `src/lib/audio.ts`：音频处理与合成测试旋律。
- `src/components/`：钢琴卷帘。
- `src/DrumPage.tsx`、`src/components/DrumTimeline.tsx`：独立扒鼓页面与共享时间轴的鼓谱、波形、频谱。
- `src/lib/drums.ts`、`src/drums.worker.ts`：浏览器内 HPSS、起音分类和合成鼓组示例。

生产构建产物位于 `dist/`，可以部署到任何静态站点服务；模型及 WASM 文件须保持原路径。当前 Vite 配置以站点根路径部署。

## 已验证的真实歌曲

已用用户提供的《Promise》（4 分 40 秒 MP3）跑完整流程：修复 WASM 兼容问题后，在本机浏览器约半分钟内完成，默认过滤保留 3177 个候选音符；过滤强度 50% 时为 1148 个。数量不是准确率指标，仍需要人工校对。详见 `VALIDATION.md`。

## 开源协议

Copyright 2026 LiRenTech。

本项目原创代码采用 [Apache License 2.0](LICENSE)，版权声明见 [NOTICE](NOTICE)。允许在遵守协议条款的前提下使用、修改、分发和商业使用。

第三方代码、模型和资源仍遵循各自的许可证，不因本项目采用 Apache-2.0 而改变。

### 上游资料与许可

- [Spotify Basic Pitch TypeScript](https://github.com/spotify/basic-pitch-ts)，Apache-2.0，模型来自其 npm 包。
- [TensorFlow.js](https://github.com/tensorflow/tfjs)，Apache-2.0；其中 Layers 还包含 MIT 授权内容。
- [Tone.js MIDI](https://github.com/Tonejs/Midi)，MIT。
- [React](https://github.com/facebook/react)，MIT。
- [Lucide](https://github.com/lucide-icons/lucide)，ISC，包含源自 Feather 的 MIT 授权内容。

补充的模型、推理依赖许可见 [第三方声明](public/THIRD_PARTY_NOTICES.txt)。安装依赖和构建时会复制项目许可、模型及 WASM 声明；Vite 还会为主线程打包的依赖生成 `DEPENDENCY_LICENSES.txt`。发布时请保留这些文件及模型、WASM 目录内的许可文件。

升级推理依赖或模型后，应同步核对并更新第三方声明；其对应版本和来源记录在声明文件内。

## SEO 与站点地址

正式地址为 https://hear-score.lirentech.net/ 。首页 HTML 提供中文标题、描述、canonical、Open Graph / Twitter 分享信息和 WebApplication JSON-LD；首屏静态说明在 React 加载后由交互界面替换，界面侧栏保留功能说明与使用步骤。

`public/robots.txt` 允许抓取，并声明 `public/sitemap.xml` 中的首页地址。更换域名时需同步修改这两个文件及 `index.html` 中的 canonical、og:url 和结构化数据 URL。发布后可以向搜索引擎站长平台提交 `https://hear-score.lirentech.net/sitemap.xml`；收录和排名由搜索引擎决定。
