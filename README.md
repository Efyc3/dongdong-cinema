# 咚咚映画独立部署版

这是现有网站的标准 Next.js 副本，可部署到支持 Node.js 或 Docker 的主机。保留电影、电视剧、动画、漫画栏目、搜索、分流、播放器、高清轮播和本地观看记录。

当前状态：**已上线：[咚咚映画](https://dongdong-cinema.onrender.com)。** 无需登录。2026-10-03，用户已确认大陆手机关闭节点后可以进入。

## 当前免费部署

托管：Render Web Service；区域：Singapore；方案：Free；运行环境：Docker。无需购买域名。

源码：[Efyc3/dongdong-cinema](https://github.com/Efyc3/dongdong-cinema)，部署分支为 `main`。已提供 `render.yaml` 和 Dockerfile。

重新部署时，在 [Render](https://dashboard.render.com/) 使用上述公开仓库创建 Web Service；选择 Docker、Singapore、Free，Dockerfile 路径为 `./Dockerfile`。环境变量：`PORT=10000`、`HOSTNAME=0.0.0.0`。

Render 免费实例空闲 15 分钟会休眠，下次访问可能等待约一分钟；有时长、流量、构建及对外请求限制。当前使用 Free，没有添加付费资源。

官方说明：[免费套餐](https://render.com/docs/free)、[公开网址](https://render.com/docs/web-services)、[区域](https://render.com/docs/regions)、[Docker 部署](https://render.com/docs/docker)。

## 本地与其他主机

Node.js 22.13 以上：

```sh
npm ci
npm run build
npm start
```

生产构建生成 `.next/standalone/server.js`；构建后脚本自动补齐公开资源和静态文件。Docker 构建会重新安装对应系统的依赖，不要上传本机 `node_modules` 或 `.next`。

```sh
docker build -t dongdong-cinema .
docker run --rm -p 3000:3000 dongdong-cinema
```

## 提前缓存与本地观看

视频使用 Hls.js 时默认提前缓冲 3 分钟，可选择 30 秒、3 分钟或 10 分钟；播放器显示实际已缓冲时长。原生 HLS 和普通视频由浏览器管理缓冲。支持跨域下载的 MP4/WebM 直链可保存到本地，HLS 分流目前仅支持提前缓冲。资料库的“打开本地视频”可播放已保存的文件。

漫画在当前页加载后自动预读后面 3 页。“缓存本章”将图片保存到当前浏览器的 IndexedDB，支持进度、取消、续存和清理；已缓存章节从“资料库 → 本地缓存”打开。网站页面和脚本同时缓存，正常完成准备后可断网回读。来源限额和访问规则仍按原站执行。

## 已验证

2026-10-04：生产构建通过；视频下载和离线页面的 18 项回归断言通过；漫画请求共享、取消、限额停止及本地回读检查通过；真实浏览器 IndexedDB 的 11 项检查通过。独立检查使用模拟响应，没有请求真实来源。

本地生产服务实际缓存 MangaDex 的 5 页短章节（7.2 MB），全屏翻页正常。关闭该服务后重新加载网站，资料库仍可打开章节，图片从本地回读并恢复到第 2 页。未逐一验证全部来源的视频下载和漫画缓存能力。

2026-10-03：标准 Next.js 生产构建及 TypeScript 检查通过；本地 standalone 服务启动成功，首页和 CSS 返回 200，热门电影列表 24 项，无效搜索栏目返回 400。Render 上的 Linux Docker 构建和部署成功，公网首页返回 200 并显示新名称；搜索“康斯坦丁”返回 200，合并结果含 7 个来源。用户已确认大陆手机关闭节点后可以进入。尚未逐一验证全部媒体来源播放。

观看记录仍保存在各设备浏览器；记录按域名隔离，换网址后旧网址的记录不会自动迁移。本副本不包含原平台托管身份、登录门禁、部署凭据或本地代理配置。
