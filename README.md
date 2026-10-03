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

## 已验证

2026-10-03：标准 Next.js 生产构建及 TypeScript 检查通过；本地 standalone 服务启动成功，首页和 CSS 返回 200，热门电影列表 24 项，无效搜索栏目返回 400。Render 上的 Linux Docker 构建和部署成功，公网首页返回 200 并显示新名称；搜索“康斯坦丁”返回 200，合并结果含 7 个来源。用户已确认大陆手机关闭节点后可以进入。尚未逐一验证全部媒体来源播放。

观看记录仍保存在各设备浏览器；记录按域名隔离，换网址后旧网址的记录不会自动迁移。本副本不包含原平台托管身份、登录门禁、部署凭据或本地代理配置。
