# luci-app-xboxaccel

在 OpenWrt / iStoreOS 上为 Xbox 下载域名选择 CDN 节点。插件把选中的 IPv4 写进 dnsmasq 的 `address` 记录，游戏文件由主机和 CDN 直接传输。

只有把 DNS 指到**运行本插件的路由器、53 端口**的设备会用到这些记录。走其他解析地址或其他端口的设备保持原样。

## 安装

从本仓库的 Releases 页面下载最新的 `luci-app-xboxaccel_<版本>-<打包修订>_all.ipk`，拷到路由器后执行：

```sh
opkg install /tmp/luci-app-xboxaccel_*_all.ipk
```

安装完成后，在 LuCI 打开 **服务 → Xbox 下载选点**。

这个 ipk 是 gzip 压缩的 tar 包，供使用 opkg 的 OpenWrt / iStoreOS 24.10 安装。依赖 `luci-base`、`curl`、`uhttpd`、`nftables` 和 `kmod-nft-nat`。

1.1.0 及更早的包里没有 302 跳转，`assets1.xboxlive.com` 会被直接写成节点地址，节点返回 `Deny-Reason: hotload no host conf!!`。1.2.0 的源码加了跳转，但仓库此前没有生成 1.2.0 的 ipk；路由器上如果还是旧包，dnsmasq 里不会出现 `198.18.88.80`，也不会有 8079 监听。

自己打包时，在仓库根目录执行：

```sh
python tools/build_ipk.py
```

产物在 `dist/`；开发构建用 `python tools/build_ipk.py --dev`，产物在 `dist/dev/`，版本带 `+git<hash>`。用 OpenWrt SDK 编译时，把本仓库当作一个软件包目录即可，`Makefile` 会从 `VERSION`/`RELEASE` 读取版本并装入同一套文件。

## 版本与发布

- `VERSION` 是 `主.次.修`：主版本用于不兼容改动，次版本用于新功能，修订用于纯修复。
- `RELEASE` 是打包修订：只改脚本/依赖/权限、不改代码行为时递增；`VERSION` 变化时重置为 `1`。
- **普通提交不要求改版本。** 构建同一个版本可以反复覆盖产物；只有发布或重新打包时才改 `VERSION`/`RELEASE`。
- 发布流程：改 `VERSION`/`RELEASE` → 提交 → 打 `v$(cat VERSION)` 标签 → `python tools/build_ipk.py`。
- 当前版本：`1.3.0-1`。

`ipk/control` 里的 `Version` 只是给人看的基线；`tools/build_ipk.py` 会用 `VERSION`/`RELEASE` 覆盖它。`Makefile` 同样直接读取这两个文件。

## 让 Xbox 用到选点

1. 打开 **服务 → Xbox 下载选点**。
2. 需要时点 **开始**，等待测速结束。表中会显示每个节点的线路、位置、速度、实收大小和延迟。
3. 把 Xbox 的 DNS 改成这台路由器的局域网地址，端口用默认的 53。
4. 按下面两种模式之一启用节点。

`assets1`、`assets2`、`d1`、`d2` 的 `.xboxlive.cn` 直接指向选中的 IPv4。`.xboxlive.com` 在「国际域名跳转到国内域名」打开时指向路由器自己，由路由器返回 HTTP 302：主下载名（`assets1`、`assets2`、`d1`、`d2`、`xvcf1`、`xvcf2`）跳到 `assets1.xboxlive.cn`，旧下载名（`dlassets`、`dlassets2`）跳到 `dlassets.xboxlive.cn`。国内节点只认这些 `.cn` 主机名，把 `.com` 直接解析成节点地址会返回 403 `hotload no host conf!!`。

`xvcf1.xboxlive.cn`、`xvcf2.xboxlive.cn` 在公网 DNS 里没有记录，国内节点也没有这两个 vhost。它们和 `.com` 一样走 302 到 `assets1.xboxlive.cn`，不能再直接写成节点地址（直接写会得到 403 或 502）。

备用 CDN 名 `5.xb.delivery.microsoft.com`、`assets1.xboxlive.com.edgesuite.net`、`cl-glcb907925.gcdn.co`、`fg.microsoft.map.fastly.net` 同样跳到 `assets1.xboxlive.cn`。`assets-srvs.xboxlive.com` 及其 SRV 目标改写成 `assets1.xboxlive.com:80`，避免主机中途改走海外 CDN。做法与 [XboxDownload](https://github.com/skydevil88/XboxDownload) 的 OpenWrt 说明一致，但不改管理页的 80 端口。

### 为什么 .com 不能直接指到节点

CDN 按 HTTP `Host` 选虚拟主机。国内节点只配置了 `.cn` 名字；`Host: assets1.xboxlive.com` 会命中 `Deny-Reason: hotload no host conf!!`，`Host: xvcf1.xboxlive.cn` 也没有配置。改 DNS、写 hosts 或做 CNAME 都只改 IP，不会改 `Host`，所以必须在这一跳返回 `302`，让主机改用节点认的 `.cn` 名字重新请求。[XboxDownload 的说明](https://github.com/skydevil88/XboxDownload/blob/master/README_OpenWrt.md) 也是这个做法：`.com` 指向路由器上的跳转服务，再 302 到 `.cn`；它的 hosts 方案里 `.com` 只能填 Akamai IP，明确写了不能用 cn IP。

## 静态模式

模式选 **静态**。在测速表里点击一行，该节点会立即启用，并显示为「使用中」。测速还在进行时也可以点，当前节点会保持显示，测速结束后也不会被自动换成别的地址。不需要手填 IP。

再点另一行即可更换。关掉 **启用** 并保存后，域名恢复为原来的解析。

## 动态模式

模式选 **动态**，打开 **启用**，然后保存并应用。

路由器会按间隔测速，默认 30 分钟，可在页面上修改。当前节点连不上时，立刻换到最快的可用节点。当前节点仍然可用时，新节点至少快过 20% 才切换。没有可用节点时，撤掉对应线路的改写。

主下载和旧下载各自选一个地址：主下载地址用于 `assets`、`d1`、`d2`、`xvcf`，旧下载地址只用于 `dlassets`。两条线路互不影响；旧下载地址不会改变主下载域名的解析。

## 测速

主下载默认样本是 `http://assets1.xboxlive.cn/Z/routing/extraextralarge.txt`，每个节点最多下载 50 MB，用来得到稳定速度。旧下载节点不提供 `/Z/routing/extraextralarge.txt`（会返回 404），默认改用 XboxDownload 的 cn2 样本文件（路径以 `/public/content/` 开头，完整值显示在页面上）；这个路径可以修改。样本大小可在 8 MB 到 100 MB 之间调整。

「测速域名」有两种：

- **`.cn 直连`**：默认。直接测节点，选点用这一路。
- **`.com 经 302`**：先请求本机 `8079` 的 302，再把跳转目标 `.cn` 强制指到同一个候选节点。它验证的是 `.com` 实际走的路径，不改 DNS，也不需要先选中节点。

`.com` 的 302 耗时会从速度里扣掉：脚本用 curl 的 `time_total - time_redirect` 算下载速度，所以和 `.cn` 的 bps 可比。`.com` 测速至少用 16 MB（快速测速也一样），避免 TCP 慢启动把 302 后的第一段算得太低。建议先跑一轮 `.cn`，再跑一轮 `.com`；结束后页面和日志会给出 `.com/.cn` 的平均、最差比例，平均低于 80% 会标记 `com_warn`（最差比例只用于展示单点波动）。只有上一轮也是 `.cn` 时才做这个对照。

本机到重庆节点 `219.152.87.113` 的多次 32 MB 对照：`.com` 在 `.cn` 的 85%–118% 之间，平均约 99%；旧节点 `113.249.87.128` 约 102%。

手动地址仍然用节点认的 Host：即使「手动地址使用的域名」填了 `assets1.xboxlive.com` 或 `xvcf1.xboxlive.cn`，单点探测也会换成 `assets1.xboxlive.cn`；旧下载地址则用 `dlassets.xboxlive.cn`。否则节点会按主机名拒绝，测到的 403 不是速度问题。

命令行也可以直接跑：

```sh
/usr/sbin/xboxaccel test thorough any cn
/usr/sbin/xboxaccel test thorough any com
/usr/sbin/xboxaccel probe 219.152.87.113 com
```

`.com` 测速会自动启动本机 8079 的跳转监听；如果没有 `uhttpd` 或跳转起不来，状态会显示 `redirect-failed`，不会把 403 当成速度结果。

内置列表是公开的 Xbox 国内 IPv4 节点。额外地址可以在「额外 IP」里添加。把列表中已有 IP 的「参与」关掉，即可让它不参加测速。

选中的地址发生变化时会重启 dnsmasq，使新记录生效。重启期间解析会短暂停一下。跳转监听在本机 `8079` 端口；`198.18.88.80:80` 上没有单独的监听进程，是一条 nft 规则把该地址的 80 端口转到 8079，管理页仍用原来的 80 端口。检查时看 `nft list table inet xboxaccel`、`logread -e xboxaccel`，或直接 `curl -H 'Host: assets1.xboxlive.com' http://198.18.88.80/Z/routing/extraextralarge.txt` 是否返回 302。页面上的运行日志里，成功会写 `国际域名跳转已启动`；如果出现 `没有 nft`、`没有 uhttpd` 或 `跳转服务没有起来`，按提示补依赖或检查 8079 是否被占用。如果路由器上跑 Clash/OpenClash 一类 fake-IP 代理（常见 `198.18.0.0/16`），`198.18.88.80` 可能被代理接管，需要把该地址设为直连或换掉 fake-IP 段。保存后让 Xbox 重新连接无线，清掉已经缓存的地址。主机 DNS 只填这台路由器；这些名字不再返回 IPv6。

### 连接日志

页面「运行日志」里点「连接日志」可以看每次到本机 302 的请求：时间、客户端 IP、Host、原路径、目标。记录在 `/tmp/xboxaccel.redirect.log`，超过 128 KB 自动裁到 64 KB，页面显示最近 200 条。命令行：

```sh
/usr/sbin/xboxaccel log conn
/usr/sbin/xboxaccel log conn clear
```

只记录经过本插件 302 的请求（`.com`、`xvcf*.cn`、备用 CDN 名）。`.cn` 文件下载是主机直连节点，不经过路由器上的用户态服务，所以这里看不到每个文件连接；要记录所有 Xbox TCP 连接需要 nft/conntrack，量大且复杂，没有做。`.com` 测速的请求客户端是 `127.0.0.1`，可以用筛选过滤。

## 许可

Apache-2.0。域名表、节点列表的整理方式、脚本和 LuCI 页面为本仓库编写。节点地址是公开的 CDN 地址。

Xbox 是 Microsoft 的商标。本项目与 Microsoft 没有隶属、赞助或认可关系。
