# luci-app-xboxaccel

在 OpenWrt / iStoreOS 上为 Xbox 下载域名选择 CDN 节点。插件把选中的 IPv4 写进 dnsmasq 的 `address` 记录，游戏文件由主机和 CDN 直接传输。

只有把 DNS 指到**运行本插件的路由器、53 端口**的设备会用到这些记录。走其他解析地址或其他端口的设备保持原样。

## 安装

从本仓库的 Releases 页面下载 `luci-app-xboxaccel_1.0.0-1_all.ipk`，拷到路由器后执行：

```sh
opkg install /tmp/luci-app-xboxaccel_1.0.0-1_all.ipk
```

安装完成后，在 LuCI 打开 **服务 → Xbox 下载选点**。

这个 ipk 是 gzip 压缩的 tar 包，供使用 opkg 的 OpenWrt / iStoreOS 24.10 安装。依赖 `luci-base` 和 `curl`。

自己打包时，在仓库根目录执行：

```sh
python tools/build_ipk.py
```

产物在 `dist/luci-app-xboxaccel_1.0.0-1_all.ipk`。用 OpenWrt SDK 编译时，把本仓库当作一个软件包目录即可，`Makefile` 会装入同一套文件。

## 让 Xbox 用到选点

1. 打开 **服务 → Xbox 下载选点**。
2. 需要时点 **开始**，等待测速结束。表中会显示每个节点的线路、位置、速度、实收大小和延迟。
3. 把 Xbox 的 DNS 改成这台路由器的局域网地址，端口用默认的 53。
4. 按下面两种模式之一启用节点。

改写的域名是这些名字的 `.xboxlive.com` 和 `.xboxlive.cn`：`assets1`、`assets2`、`d1`、`d2`、`xvcf1`、`xvcf2`、`dlassets`、`dlassets2`。它们会指向同一个选中的 IPv4。

## 静态模式

模式选 **静态**。在测速表里点击一行，该节点会立即启用，并显示为「使用中」。测速还在进行时也可以点，当前节点会保持显示，测速结束后也不会被自动换成别的地址。不需要手填 IP。

再点另一行即可更换。关掉 **启用** 并保存后，域名恢复为原来的解析。

## 动态模式

模式选 **动态**，打开 **启用**，然后保存并应用。

路由器会按间隔测速，默认 30 分钟，可在页面上修改。当前节点连不上时，立刻换到最快的可用主下载节点。当前节点仍然可用时，新节点至少快过 20% 才切换。没有可用的主下载节点时，撤掉改写。

自动选点只采用「主下载」里测通的地址。「旧下载」节点会显示测速结果，但不参与自动切换。

## 测速

默认样本是 `http://assets1.xboxlive.cn/Z/routing/extraextralarge.txt`。每个节点最多下载 50 MB，用来得到稳定速度。旧下载节点对 `dlassets.xboxlive.cn` 使用同一路径。样本大小可在 8 MB 到 100 MB 之间调整。

内置列表是公开的 Xbox 国内 IPv4 节点。额外地址可以在「额外 IP」里添加。把列表中已有 IP 的「参与」关掉，即可让它不参加测速。

选中的地址发生变化时会重启 dnsmasq，使新记录生效。重启期间解析会短暂停一下。插件不修改防火墙，也不占用管理页端口。

## 许可

Apache-2.0。域名表、节点列表的整理方式、脚本和 LuCI 页面为本仓库编写。节点地址是公开的 CDN 地址。

Xbox 是 Microsoft 的商标。本项目与 Microsoft 没有隶属、赞助或认可关系。
