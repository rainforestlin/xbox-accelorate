include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-xboxaccel
PKG_VERSION:=$(shell cat $(CURDIR)/VERSION)
PKG_RELEASE:=$(shell cat $(CURDIR)/RELEASE)
PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=xboxaccel

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-xboxaccel
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=Xbox download CDN selector
  DEPENDS:=+curl +luci-base +uhttpd +nftables +kmod-nft-nat
  PKGARCH:=all
endef

define Package/luci-app-xboxaccel/description
  Resolve Xbox download hostnames to a selected CDN address for clients
  that use this router's DNS on port 53.
endef

define Package/luci-app-xboxaccel/conffiles
/etc/config/xboxaccel
endef

define Build/Compile
endef

define Package/luci-app-xboxaccel/install
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) ./src/usr/sbin/xboxaccel $(1)/usr/sbin/xboxaccel
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./src/etc/init.d/xboxaccel $(1)/etc/init.d/xboxaccel
	$(INSTALL_DIR) $(1)/etc/hotplug.d/iface
	$(INSTALL_BIN) ./src/etc/hotplug.d/iface/99-xboxaccel $(1)/etc/hotplug.d/iface/99-xboxaccel
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./src/etc/config/xboxaccel $(1)/etc/config/xboxaccel
	$(INSTALL_DIR) $(1)/usr/share/xboxaccel
	$(INSTALL_BIN) ./src/usr/share/xboxaccel/policy $(1)/usr/share/xboxaccel/policy
	$(INSTALL_BIN) ./src/usr/share/xboxaccel/roster $(1)/usr/share/xboxaccel/roster
	$(INSTALL_DATA) ./src/usr/share/xboxaccel/domains $(1)/usr/share/xboxaccel/domains
	$(INSTALL_DATA) ./src/usr/share/xboxaccel/nodes.tsv $(1)/usr/share/xboxaccel/nodes.tsv
	$(INSTALL_BIN) ./src/usr/share/xboxaccel/redir-run $(1)/usr/share/xboxaccel/redir-run
	$(INSTALL_DATA) ./src/usr/share/xboxaccel/uhttpd.empty $(1)/usr/share/xboxaccel/uhttpd.empty
	$(INSTALL_DIR) $(1)/usr/share/xboxaccel/www/cgi-bin
	$(INSTALL_BIN) ./src/usr/share/xboxaccel/www/cgi-bin/redirect $(1)/usr/share/xboxaccel/www/cgi-bin/redirect
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./src/usr/share/luci/menu.d/luci-app-xboxaccel.json $(1)/usr/share/luci/menu.d/luci-app-xboxaccel.json
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./src/usr/share/rpcd/acl.d/luci-app-xboxaccel.json $(1)/usr/share/rpcd/acl.d/luci-app-xboxaccel.json
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view
	$(INSTALL_DATA) ./src/www/luci-static/resources/view/xboxaccel.js $(1)/www/luci-static/resources/view/xboxaccel.js
	$(INSTALL_DATA) ./src/www/luci-static/resources/view/xboxaccel.css $(1)/www/luci-static/resources/view/xboxaccel.css
endef

$(eval $(call BuildPackage,luci-app-xboxaccel))
