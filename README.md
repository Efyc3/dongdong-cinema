# 咚咚映画独立部署版

这是现有网站的标准 Next.js 副本，可部署到支持 Node.js 或 Docker 的主机。保留电影、电视剧、动画、漫画栏目、搜索、分流、播放器、高清轮播和本地观看记录。

当前状态：**代码已准备并通过本地生产构建，尚未部署到新的公网地址。** 原网站仍使用原地址。

## 免费部署候选

Render 提供免费 Web Service、公开 HTTPS 网址和 Singapore 区域；无需先购买域名。已提供 `render.yaml` 和 Dockerfile。

1. 注册并登录 [Render](https://dashboard.render.com/)。账号登录和可能出现的验证由你完成，不需要把密码交给助手。
2. 将本目录内容放入自己可访问的 Git 仓库，再在 Render 创建 Web Service 或 Blueprint。
3. 使用 Docker、Singapore、Free；Dockerfile 路径为 `./Dockerfile`。环境变量：`PORT=10000`、`HOSTNAME=0.0.0.0`。
4. 等待部署成功，再在大陆手机上关闭节点，分别用 Wi-Fi 和移动数据验证首页、搜索、播放、漫画图片。

现在没有 Render 账号，也没有新部署地址，因此**尚不能确认新入口大陆直连可用**。Render 免费实例空闲 15 分钟会休眠，下次访问可能等待约一分钟；有时长、流量、构建及对外请求限制。选择 Free，不升级套餐、不添加付费资源。

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

2026-10-03：标准 Next.js 生产构建及 TypeScript 检查通过；standalone 服务启动成功；首页和 CSS 返回 200；热门目录返回 200，电影列表 24 项；无效搜索栏目返回 400。未在 Linux 上运行 Docker 构建，未验证新托管的访问和媒体来源可达性。

观看记录仍保存在各设备浏览器；记录按域名隔离，换网址后旧网址的记录不会自动迁移。本副本不包含原平台托管身份、登录门禁、部署凭据或本地代理配置。
