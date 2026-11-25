'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require poll';

var REASONS = {
	kept: '当前节点仍然可用，速度差没有超过阈值',
	selected: '已选定最快的节点',
	switched: '已切换到更快的节点',
	'current-dead': '当前节点不可用，已换到最快的可用节点',
	'no-healthy': '没有可用节点，已取消域名改写',
	'no-candidate': '没有启用的候选 IP',
	static: '静态模式，使用固定 IP',
	disabled: '服务未启用',
	'missing-ip': '还没有可用的 IP',
	running: '正在测速'
};

function formatBytes(bps) {
	var n = Number(bps) || 0;
	if (n >= 1024 * 1024)
		return (n / 1024 / 1024).toFixed(2) + ' MB/s';
	if (n >= 1024)
		return (n / 1024).toFixed(1) + ' KB/s';
	return Math.round(n) + ' B/s';
}

function formatSize(bytes) {
	var n = Number(bytes) || 0;
	if (n >= 1024 * 1024)
		return (n / 1024 / 1024).toFixed(1) + ' MB';
	if (n >= 1024)
		return (n / 1024).toFixed(0) + ' KB';
	return n ? (n + ' B') : '';
}

function groupName(group) {
	if (group === 'cn1')
		return '主下载';
	if (group === 'cn2')
		return '旧下载';
	return '手动';
}

function parseCatalog(text) {
	return String(text || '').split(/\n/).map(function(line) {
		var parts = line.split('\t');
		if (parts.length < 4 || !parts[0] || parts[0].charAt(0) === '#')
			return null;
		return { ip: parts[0], loc: parts[1], host: parts[2], group: parts[3] };
	}).filter(Boolean);
}

function parseStatus(text) {
	if (!text)
		return {};
	try {
		return JSON.parse(text);
	} catch (e) {
		return {};
	}
}

function currentMode() {
	var el = document.getElementById('widget.cbid.xboxaccel.main.mode') ||
		document.getElementById('cbid.xboxaccel.main.mode');
	return el && el.value ? el.value : '';
}

function useNode(ip, done) {
	ui.showModal(_('启用节点'), [
		E('p', { 'class': 'spinning' }, [_('正在启用 ') + ip + _(' …')])
	]);
	return fs.exec('/usr/sbin/xboxaccel', ['use', ip]).then(function(res) {
		ui.hideModal();
		if (res.code !== 0) {
			ui.addNotification(null, E('p', {}, [res.stderr || res.stdout || _('启用失败')]));
			return;
		}
		var sel = document.getElementById('widget.cbid.xboxaccel.main.mode') ||
			document.getElementById('cbid.xboxaccel.main.mode');
		if (sel)
			sel.value = 'static';
		if (done)
			return done();
	}).catch(function(err) {
		ui.hideModal();
		ui.addNotification(null, E('p', {}, [err.message || _('启用失败')]));
	});
}

function renderBoard(catalog, text) {
	var data = parseStatus(text);
	var measured = {};
	(data.results || []).forEach(function(row) {
		measured[row.ip] = row;
	});
	var seen = {};
	var rows = catalog.map(function(node) {
		seen[node.ip] = true;
		return { node: node, measured: measured[node.ip] || null };
	});
	(data.results || []).forEach(function(row) {
		if (seen[row.ip])
			return;
		rows.push({
			node: { ip: row.ip, loc: row.loc || '', host: row.host || '', group: row.group || 'manual' },
			measured: row
		});
	});
	rows.sort(function(a, b) {
		var as = a.measured && a.measured.ok ? Number(a.measured.bps) : -1;
		var bs = b.measured && b.measured.ok ? Number(b.measured.bps) : -1;
		return bs - as;
	});
	var tested = (data.results || []).length;
	var when = data.time ? new Date(data.time * 1000).toLocaleString() : '';
	var staticMode = currentMode() === 'static' || (!currentMode() && data.mode === 'static');
	var inUse = data.enabled === 1 && !!data.active && data.reason !== 'disabled' && data.reason !== 'missing-ip';
	var fastest = '';
	rows.forEach(function(item) {
		if (item.node.group !== 'cn1' && item.node.group !== 'manual')
			return;
		if (!item.measured || !item.measured.ok)
			return;
		if (!fastest || Number(item.measured.bps) > Number(measured[fastest].bps || 0))
			fastest = item.node.ip;
	});
	var summary = (data.running ? '正在测速' : '空闲') +
		(when ? '　' + when : '') +
		'　已出结果 ' + tested + ' / ' + Math.max(rows.length, tested) +
		'　当前节点：' + (inUse && data.active ? data.active : '未启用') +
		(staticMode ? '　点击一行即可启用该节点' : '');
	var table = E('table', { 'class': 'table' }, [
		E('tr', { 'class': 'tr' }, [
			'线路', '位置', 'IP', '速度', '实收', '延迟', '结果'
		].map(function(title) {
			return E('th', { 'class': 'th' }, [title]);
		}))
	]);
	rows.forEach(function(item) {
		var row = item.measured;
		var using = inUse && data.active === item.node.ip;
		var label = using ? '使用中' : (!row ? '待测速' : (row.ok ? (item.node.ip === fastest ? '最快' : (staticMode ? '点击启用' : '可用')) : ('HTTP ' + (row.http || 0))));
		var tr = E('tr', {
			'class': 'tr',
			'style': (using ? 'background:rgba(32,128,64,.16);' : '') + (staticMode ? 'cursor:pointer' : '')
		}, [
			E('td', { 'class': 'td' }, [groupName(item.node.group)]),
			E('td', { 'class': 'td' }, [item.node.loc || (row && row.loc) || '']),
			E('td', { 'class': 'td' }, [item.node.ip]),
			E('td', { 'class': 'td' }, [row && row.ok ? formatBytes(row.bps) : (row ? '—' : '')]),
			E('td', { 'class': 'td' }, [row ? formatSize(row.bytes) : '']),
			E('td', { 'class': 'td' }, [row && row.conn_ms ? (row.conn_ms + ' ms') : '']),
			E('td', { 'class': 'td' }, [label])
		]);
		tr.addEventListener('click', function() {
			if (currentMode() !== 'static')
				return;
			useNode(item.node.ip, function() {
				return fs.read('/tmp/xboxaccel.status').then(function(text) {
					if (window.xboxaccelPaint)
						window.xboxaccelPaint(text);
				});
			});
		});
		table.appendChild(tr);
	});
	return E('div', {}, [
		E('p', {}, [summary]),
		table
	]);
}

return view.extend({
	load: function() {
		return Promise.all([
			fs.read('/tmp/xboxaccel.status').catch(function() { return ''; }),
			fs.read('/usr/share/xboxaccel/domains').catch(function() { return ''; }),
			fs.read('/usr/share/xboxaccel/nodes.tsv').catch(function() { return ''; })
		]);
	},

	render: function(data) {
		var statusText = data[0];
		var catalog = parseCatalog(data[2]);
		var domains = String(data[1] || '')
			.split(/\n/)
			.map(function(line) { return line.trim(); })
			.filter(function(line) { return line && line.charAt(0) !== '#'; });

		var m = new form.Map('xboxaccel', _('Xbox 下载选点'),
			_('把 Xbox 下载域名解析到选定的 CDN IP。只有把 DNS 指到本机 53 端口的设备会命中。'));

		var s = m.section(form.NamedSection, 'main', 'settings', _('服务'));
		s.option(form.Flag, 'enabled', _('启用'));

		var mode = s.option(form.ListValue, 'mode', _('模式'));
		mode.value('static', _('静态'));
		mode.value('dynamic', _('动态'));

		var interval = s.option(form.Value, 'interval', _('测速间隔（分钟）'));
		interval.datatype = 'range(5,1440)';
		interval.placeholder = '30';
		interval.depends('mode', 'dynamic');
		interval.rmempty = false;

		var margin = s.option(form.Value, 'margin', _('切换阈值（%）'),
			_('新节点至少比当前节点快过这个百分比才切换。'));
		margin.datatype = 'range(0,90)';
		margin.placeholder = '20';
		margin.depends('mode', 'dynamic');
		margin.rmempty = false;

		var probe = s.option(form.Button, '_probe', _('立即测速'));
		probe.inputstyle = 'apply';
		probe.inputtitle = _('开始');
		probe.onclick = function() {
			return fs.exec('/usr/sbin/xboxaccel', ['test-bg']).then(function(res) {
				if (res.code !== 0) {
					ui.addNotification(null, E('p', {}, [
						res.stderr || res.stdout || _('测速未能启动')
					]));
				}
			});
		};

		var sample = m.section(form.NamedSection, 'main', 'settings', _('测速样本'),
			_('每个节点最多下载这里设定的大小。默认 50 MB，用来避开过短样本造成的测速偏差。'));
		sample.option(form.Value, 'sample_host', _('域名')).placeholder = 'assets1.xboxlive.cn';
		sample.option(form.Value, 'sample_path', _('路径')).placeholder = '/Z/routing/extraextralarge.txt';
		var mib = sample.option(form.Value, 'sample_mib', _('样本大小（MB）'));
		mib.datatype = 'range(8,100)';
		mib.placeholder = '50';
		mib.rmempty = false;

		var c = m.section(form.GridSection, 'candidate', _('额外 IP'),
			_('内置列表会自动参加测速。这里只添加列表之外的地址；把同一个 IP 的「参与」关掉，即可从测速中排除。'));
		c.anonymous = true;
		c.addremove = true;
		c.sortable = false;

		c.option(form.Value, 'name', _('备注'));
		var ip = c.option(form.Value, 'ip', _('IP'));
		ip.datatype = 'ip4addr';
		ip.rmempty = false;
		var en = c.option(form.Flag, 'enabled', _('参与'));
		en.default = '1';
		en.editable = true;

		var live = m.section(form.NamedSection, 'main', 'settings', _('CDN 测速'),
			_('改写的域名：') + domains.join('、'));
		var board = live.option(form.DummyValue, '_board');
		board.render = function() {
			return E('div', { 'id': 'xboxaccel-board' });
		};

		var lastText = statusText;
		function paint(text) {
			lastText = text;
			var box = document.getElementById('xboxaccel-board');
			if (!box)
				return;
			while (box.firstChild)
				box.removeChild(box.firstChild);
			box.appendChild(renderBoard(catalog, text));
		}
		window.xboxaccelPaint = paint;

		return m.render().then(function(node) {
			paint(statusText);
			var modeEl = document.getElementById('widget.cbid.xboxaccel.main.mode') ||
				document.getElementById('cbid.xboxaccel.main.mode');
			if (modeEl)
				modeEl.addEventListener('change', function() { paint(lastText); });
			poll.add(function() {
				return fs.read('/tmp/xboxaccel.status').then(paint).catch(function() {});
			}, 3);
			return node;
		});
	},

	handleSaveApply: function(ev, mode) {
		return this.handleSave(ev).then(function() {
			return ui.changes.apply(mode == '0');
		}).then(function() {
			return fs.exec('/usr/sbin/xboxaccel', ['apply']);
		});
	}
});
