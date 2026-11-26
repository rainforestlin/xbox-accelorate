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

1.1.0 及更早的包里没有 302 跳转，`assets1.xboxlive.com` 会被直接写成节点地址，节点返回 `Deny-Reason: hotload no host conf!!`。当前统一打包的 `1.2.0-1` 包含 HTTPS 回源、节点在线列表、IPv6 模式和连接日志；路由器上如果还是旧包，dnsmasq 里不会出现跳转假地址，也不会有 8079 监听。

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
- 当前统一打包版本：`1.2.0-1`。**在路由器确认能正常运行前，后续修复继续复用 1.2.0-1，不递增版本号**；确认稳定后再按上面的规则迭代。

`ipk/control` 里的 `Version` 只是给人看的基线；`tools/build_ipk.py` 会用 `VERSION`/`RELEASE` 覆盖它。`Makefile` 同样直接读取这两个文件。

## 让 Xbox 用到选点

1. 打开 **服务 → Xbox 下载选点**。
2. 需要时点 **开始**，等待测速结束。表中会显示每个节点的线路、位置、速度、实收大小和延迟。
3. 把 Xbox 的 DNS 改成这台路由器的局域网地址，端口用默认的 53。
4. 按下面两种模式之一启用节点。

`assets1`、`assets2`、`d1`、`d2` 的 `.xboxlive.cn` 直接指向选中的 IPv4。`.xboxlive.com`、`xvcf*.xboxlive.cn` 和备用 CDN 名在「国际域名跳转到国内域名」打开时，各自分配一个来自「跳转地址段」的假 IPv4：nft 把这个假地址的 TCP 80 转到本机 `8079` 的 302，把 TCP 443 DNAT 回真实源站。主下载名跳到 `assets1.xboxlive.cn`，旧下载名跳到 `dlassets.xboxlive.cn`；HTTPS 不会被黑洞，也不需要安装证书。

`xvcf1.xboxlive.cn`、`xvcf2.xboxlive.cn` 在公网 DNS 里没有记录，国内节点也没有这两个 vhost。它们只做 HTTP 302 到 `assets1.xboxlive.cn`，没有 HTTPS 源站可回；直接写成节点地址会得到 403 或 502。

备用 CDN 名 `5.xb.delivery.microsoft.com`、`assets1.xboxlive.com.edgesuite.net`、`cl-glcb907925.gcdn.co`、`fg.microsoft.map.fastly.net` 同样走 302 / HTTPS 回源。`assets-srvs.xboxlive.com` 及其 SRV 目标改写成 `assets1.xboxlive.com:80`，避免主机中途改走海外 CDN。做法与 [XboxDownload](https://github.com/skydevil88/XboxDownload) 的 OpenWrt 说明一致，但不改管理页的 80 端口。

### HTTPS 回源

- 每个需要 302 的 host 从 `redirect_net`（默认 `198.51.100.0/24`）取一个假 IPv4，DNS 返回这个假地址。
- nft 只把假地址的 80 转到本机 302；443 通过 `https4` map DNAT 到该 host 的真实源站 IP，TLS SNI 仍是原 `.com` 主机名，不 MITM。
- 源站 IP 由「源站解析 DNS」解析，缓存在 `/tmp/xboxaccel.origins`，默认 6 小时刷新；解析失败的 host 不写假地址，退回正常 DNS，HTTP 不会加速但 HTTPS 不会被黑洞。
- 旧版本的单个 `198.18.88.80` 会在升级时清理；新地址段避开 Clash 常见 `198.18.0.0/16`，仍建议把 `redirect_net` 排除在代理 fake-IP/路由之外。

### HTTPS 不会走选中的 CDN 节点

当前实现只把 `.com` 的 443 **回源到真实源站**，不会把 HTTPS 转到选中的国内节点。2026-11-26 手工测试：

```sh
# 同一个节点，.com SNI：TLS 握手失败
curl -k -o /dev/null -sS --max-time 15 \
  --resolve assets1.xboxlive.com:443:219.152.87.113 \
  -w 'com %{http_code}\n' \
  https://assets1.xboxlive.com/Z/routing/extraextralarge.txt

# 同一个节点，.cn SNI：200，能传输数据
curl -k -o /dev/null -sS --max-time 15 \
  --resolve assets1.xboxlive.cn:443:219.152.87.113 \
  -w 'cn %{http_code}\n' \
  https://assets1.xboxlive.cn/Z/routing/extraextralarge.txt
```

结果：`.com` 返回 `000`，curl 报 TLS 握手失败（`SEC_E_ILLEGAL_MESSAGE`）；`.cn` 返回 `200` 并有数据。节点按 TLS SNI 选择 vhost，`assets1.xboxlive.com` 的 SNI 不被国内节点接受。因此：

- 不能靠“把 443 DNAT 到选中节点”加速 `.com` HTTPS；TLS 握手就会失败。
- 要真正让 `.com` HTTPS 走选中的 `.cn` 节点，必须在本机终止 TLS（MITM/本地证书），再用 `.cn` SNI 重新建连；这是安全敏感功能，未实现。
- 单纯 SNI 代理不终止 TLS 也改不了 ClientHello 里的 SNI，不能解决这个问题。
- 本机测试环境直连 `.com` 源站也出现 TLS 握手失败，说明“回源透传”依赖上游网络；请在目标路由器上复测，不能把本机结果当成重庆电信的结论。

### 为什么 .com 不能直接指到节点

CDN 按 HTTP `Host` 选虚拟主机。国内节点只配置了 `.cn` 名字；`Host: assets1.xboxlive.com` 会命中 `Deny-Reason: hotload no host conf!!`，`Host: xvcf1.xboxlive.cn` 也没有配置。改 DNS、写 hosts 或做 CNAME 都只改 IP，不会改 `Host`，所以必须在这一跳返回 `302`，让主机改用节点认的 `.cn` 名字重新请求。[XboxDownload 的说明](https://github.com/skydevil88/XboxDownload/blob/master/README_OpenWrt.md) 也是这个做法：`.com` 指向路由器上的跳转服务，再 302 到 `.cn`；它的 hosts 方案里 `.com` 只能填 Akamai IP，明确写了不能用 cn IP。

## 静态模式

模式选 **静态**。在测速表里点击一行，该节点会立即启用，并显示为「使用中」。测速还在进行时也可以点，当前节点会保持显示，测速结束后也不会被自动换成别的地址。不需要手填 IP。

再点另一行即可更换。关掉 **启用** 并保存后，域名恢复为原来的解析。

## 动态模式

模式选 **动态**，打开 **启用**，然后保存并应用。

路由器会按间隔测速，默认 30 分钟，可在页面上修改。当前节点连不上时，立刻换到最快的可用节点。当前节点仍然可用时，新节点至少快过 20% 才切换。没有可用节点时，撤掉对应线路的改写。

主下载和旧下载各自选一个地址：主下载地址用于 `assets`、`d1`、`d2`、`xvcf`，旧下载地址只用于 `dlassets`。两条线路互不影响；旧下载地址不会改变主下载域名的解析。

## 节点列表

内置的 `nodes.tsv` 是基线。页面「节点列表」可以填在线 URL、备用 URL 和可选 SHA-256，点「在线更新」后从 HTTPS 拉取、校验格式/校验和，成功缓存到 `/tmp/xboxaccel.nodes.tsv` 并优先使用；断网、校验失败或文件损坏时回退旧缓存，再回退内置列表。

```sh
/usr/sbin/xboxaccel nodes-update [url]
/usr/sbin/xboxaccel nodes-status
/usr/sbin/xboxaccel nodes-clear
```

在线列表沿用 `ip<TAB>loc<TAB>host<TAB>group` 四列，`group` 只接受 `cn1`/`cn2`，host 必须在 `domains` 里。SHA-256 为空时只做 HTTPS 和格式校验；填了就必须匹配原始下载文件。

## IPv6

`ipv6_mode=block`（默认）会抑制被改写域名的 AAAA，避免主机绕过选点；`off` 不抑制 AAAA，兼容性更好，但 `.com`/`.cn` 可能直接走 IPv6 原解析，不经过本插件。当前没有 IPv6 节点选点。

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

选中的地址发生变化时会重启 dnsmasq，使新记录生效。重启期间解析会短暂停一下。跳转监听在本机 `8079` 端口；`nft list table inet xboxaccel` 里能看到 `redirect_v4` set 和 `https4` map：80 端口转到 8079，443 回源到真实地址，管理页仍用原来的 80 端口。检查时看 `nslookup assets1.xboxlive.com` 是否返回 `198.51.100.x`，再 `curl -sS -D - -o /dev/null http://assets1.xboxlive.com/Z/routing/extraextralarge.txt` 是否 302，`openssl s_client -connect assets1.xboxlive.com:443 -servername assets1.xboxlive.com` 是否 TLS 握手成功。页面运行日志成功会写 `国际域名跳转已启动`；如果出现 `没有 nft`、`没有 uhttpd`、`源站解析失败` 或 `跳转服务没有起来`，按提示检查。保存后让 Xbox 重新连接无线，清掉已经缓存的地址。主机 DNS 只填这台路由器。

### 连接日志

页面「运行日志」里点「连接日志」可以看每次到本机 302 的请求：时间、客户端 IP、Host、原路径、目标。记录在 `/tmp/xboxaccel.redirect.log`，超过 128 KB 自动裁到 64 KB，页面显示最近 200 条。命令行：

```sh
/usr/sbin/xboxaccel log conn
/usr/sbin/xboxaccel log conn clear
```

只记录经过本插件 302 的请求（`.com`、`xvcf*.cn`、备用 CDN 名）。`.cn` 文件下载是主机直连节点，不经过路由器上的用户态服务，所以这里看不到每个文件连接；要记录所有 Xbox TCP 连接需要 nft/conntrack，量大且复杂，没有做。`.com` 测速的请求客户端是 `127.0.0.1`，可以用筛选过滤。

## 语言

中文是源语言，英文目录在 [po/en.po](po/en.po)，中文对照在 [po/zh_Hans.po](po/zh_Hans.po)。LuCI 读取编译后的 `.lmo`：

```sh
python tools/build_i18n.py --out-dir src/usr/lib/lua/luci/i18n
```

生成 `xboxaccel.en.lmo`，安装到 `/usr/lib/lua/luci/i18n/`；在 LuCI 里切换语言后，`_()` 文案会使用对应目录，找不到时回退中文。修改页面文案后要同时更新 `.po` 并重新生成 `.lmo`，`tests/run.sh` 会检查两者是否一致。

## 测试

```sh
sh tests/run.sh
```

包含：shell 语法、现有 `xboxaccel check` 自测、Python 单元测试（i18n 哈希/目录/翻译覆盖、打包器）、JS 语法、i18n 重新编译一致性、ipk 构建和包内容检查；root + 有 `nft` 时还会跑 `nft -c`。

## 发布校验

`python tools/build_ipk.py` 会在产物目录生成 `SHA256SUMS`。发布时用离线 `usign` 私钥签这个清单：

```sh
sh tools/sign_release.sh dist /path/release.key /path/release.pub
sh tools/verify_release.sh dist
```

opkg 本身不支持逐包强制签名，所以这里校验的是 ipk 的 SHA-256 和可选的 `SHA256SUMS.sig`；如果必须 APK 级包签名，需要另做 OpenWrt 25.12 APK 迁移。

## 致谢

- [Zachery-Liu/luci-app-xboxdownload-openwrt](https://github.com/Zachery-Liu/luci-app-xboxdownload-openwrt)：按设备/多线路组织、fake IP + 443 回源、在线节点导入、签名发布和测试实践给了很多参考。其代码为 AGPL-3.0，本项目只参考思路和公开域名信息，未复制其代码。
- [skydevil88/XboxDownload](https://github.com/skydevil88/XboxDownload)：`.com -> .cn` 跳转思路、域名表、测速样本和 OpenWrt 说明的来源；感谢长期维护公开 IP/样本。
- 两个项目的版权与许可归各自作者；本项目与它们没有隶属、赞助或认可关系。

## 许可

Apache-2.0。域名表、节点列表的整理方式、脚本和 LuCI 页面为本仓库编写。节点地址是公开的 CDN 地址。

Xbox 是 Microsoft 的商标。本项目与 Microsoft 没有隶属、赞助或认可关系。
