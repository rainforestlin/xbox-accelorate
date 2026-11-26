'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require poll';

var REASONS = {
	kept: '仍使用当前地址',
	selected: '已选本轮最快地址',
	switched: '已换到更快的地址',
	'current-dead': '当前地址不可用，已换开',
	'no-healthy': '这一路没有可用地址',
	'no-candidate': '这一路没有纳入测速',
	'sample-miss': '样本在这一路不存在，原地址保留',
	static: '静态地址',
	disabled: '服务已停止',
	'missing-ip': '还没有公网地址',
	running: '正在测速',
	stopped: '测速已停止',
	probed: '单点测速完成',
	'dns-failed': '记录没有生效，已退回上一份',
	'redirect-failed': '跳转服务不可用，.com 测速未开始',
	idle: '还没有测速'
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

function formatProgress(bytes) {
	return ((Number(bytes) || 0) / 1024 / 1024).toFixed(1) + ' MB';
}

function groupName(group) {
	if (group === 'cn1')
		return '主下载';
	if (group === 'cn2')
		return '旧下载';
	if (group === 'manual-legacy')
		return '手动 · 旧';
	if (group === 'manual-primary')
		return '手动 · 主';
	return '手动';
}

function poolOf(group) {
	if (group === 'cn2' || group === 'manual-legacy' || group === 'legacy')
		return 'legacy';
	return 'primary';
}

function reasonText(code) {
	return REASONS[code] || code || '';
}

function blankIp(ip) {
	if (!ip || ip === 'none' || ip === '无')
		return '无';
	return ip;
}

function logText(msg) {
	var m = String(msg || '');
	var hit;
	hit = m.match(/^test kept static primary=(\S+) legacy=(\S+)/);
	if (hit)
		return '测速结束，静态地址未改。主下载 ' + blankIp(hit[1]) + '，旧下载 ' + blankIp(hit[2]);
	hit = m.match(/^test (\S+) primary=(\S+) \(([^)]*)\) legacy=(\S+) \(([^)]*)\)/);
	if (hit)
		return '测速结束（' + reasonText(hit[1]) + '）。主下载 ' + blankIp(hit[2]) + '（' + reasonText(hit[3]) + '），旧下载 ' + blankIp(hit[4]) + '（' + reasonText(hit[5]) + '）';
	hit = m.match(/^测速结束 (\S+) 主=(\S+)\(([^)]*)\) 旧=(\S+)\(([^)]*)\)/);
	if (hit)
		return '测速结束（' + reasonText(hit[1]) + '）。主下载 ' + blankIp(hit[2]) + '（' + reasonText(hit[3]) + '），旧下载 ' + blankIp(hit[4]) + '（' + reasonText(hit[5]) + '）';
	hit = m.match(/^测速结束，静态地址未改 主=(\S+) 旧=(\S+)/);
	if (hit)
		return '测速结束，静态地址未改。主下载 ' + blankIp(hit[1]) + '，旧下载 ' + blankIp(hit[2]);
	hit = m.match(/^static (primary|legacy) (\S+)/);
	if (hit)
		return '已改用静态' + (hit[1] === 'legacy' ? '旧下载 ' : '主下载 ') + hit[2];
	if (m === 'test superseded' || m === '这轮测速被新操作打断')
		return '这轮测速被新操作打断';
	hit = m.match(/^lookup did not match (\S+) (\S+)/);
	if (hit)
		return '解析没有对上 ' + hit[1] + '，期望 ' + hit[2];
	if (m === 'dnsmasq rejected the new records; previous file restored')
		return 'dnsmasq 没有接受新记录，已退回上一份';
	if (m === 'removed records but dnsmasq did not come back; restored the previous file')
		return '撤回后 dnsmasq 没有恢复，已放回上一份';
	hit = m.match(/^静态记录已生效 主=(\S+) 旧=(\S+)/);
	if (hit)
		return '静态记录已生效。主下载 ' + blankIp(hit[1]) + '，旧下载 ' + blankIp(hit[2]);
	hit = m.match(/^动态记录已生效 主=(\S+) 旧=(\S+)/);
	if (hit)
		return '动态记录已生效。主下载 ' + blankIp(hit[1]) + '，旧下载 ' + blankIp(hit[2]);
	return m;
}

function parseLog(text) {
	return String(text || '').split(/\n/).map(function(line) {
		var cut;
		if (!line)
			return null;
		cut = line.indexOf('\t');
		if (cut < 0)
			return { time: '', msg: line };
		return { time: line.slice(0, cut), msg: line.slice(cut + 1) };
	}).filter(Boolean);
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
	var data;
	if (!text)
		return {};
	try {
		data = JSON.parse(text);
	} catch (e) {
		return {};
	}
	if (!data.primary_ip && data.active)
		data.primary_ip = data.active;
	if (!data.primary_reason && data.reason)
		data.primary_reason = data.reason;
	return data;
}

function fieldBox(name) {
	return document.getElementById('cbi-xboxaccel-main-' + name) ||
		document.getElementById('cbid.xboxaccel.main.' + name) ||
		document.getElementById('widget.cbid.xboxaccel.main.' + name);
}

function fieldValue(name) {
	var root = fieldBox(name);
	var select;
	var input;
	if (!root)
		return '';
	if (root.matches && root.matches('select, input'))
		return root.value || '';
	select = root.querySelector && root.querySelector('select');
	input = root.querySelector && root.querySelector('input, textarea');
	if (select)
		return select.value || '';
	if (input)
		return input.value || '';
	return '';
}

function setField(name, value) {
	var root = fieldBox(name);
	var select;
	if (!root)
		return;
	if (root.matches && root.matches('select')) {
		root.value = value;
		return;
	}
	select = root.querySelector && root.querySelector('select');
	if (select)
		select.value = value;
}

function useNode(pool, ip, done) {
	ui.showModal(_('启用节点'), [
		E('p', { 'class': 'spinning' }, [_('正在写入 ') + ip])
	]);
	return fs.exec('/usr/sbin/xboxaccel', ['use', pool, ip]).then(function(res) {
		ui.hideModal();
		if (res.code !== 0) {
			ui.addNotification(null, E('p', {}, [res.stderr || res.stdout || _('启用失败')]));
			return;
		}
		setField('mode', 'static');
		if (done)
			return done();
	}).catch(function(err) {
		ui.hideModal();
		ui.addNotification(null, E('p', {}, [err.message || _('启用失败')]));
	});
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
		var domains = String(data[1] || '').split(/\n/).map(function(line) {
			return line.split('\t')[0].trim();
		}).filter(function(line) {
			return line && line.charAt(0) !== '#';
		});
		var liveText = E('span', { 'role': 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, ['空闲']);
		var dot = E('span', { 'class': 'xa-dot', 'aria-hidden': 'true' });
		var primaryValue = E('p', { 'class': 'xa-v' }, ['未选择']);
		var legacyValue = E('p', { 'class': 'xa-v' }, ['未选择']);
		var primaryReason = E('p', { 'class': 'xa-s' }, ['']);
		var legacyReason = E('p', { 'class': 'xa-s' }, ['']);
		var modeValue = E('p', { 'class': 'xa-v' }, ['静态']);
		var modeReason = E('p', { 'class': 'xa-s' }, ['']);
		var search = E('input', {
			'type': 'search',
			'class': 'cbi-input-text',
			'aria-label': '筛选位置或 IP',
			'placeholder': '筛选位置或 IP'
		});
		var viewFilter = E('select', { 'aria-label': '节点范围' }, [
			E('option', { 'value': 'round' }, ['本轮结果']),
			E('option', { 'value': 'all' }, ['全部节点']),
			E('option', { 'value': 'primary' }, ['只看主下载']),
			E('option', { 'value': 'legacy' }, ['只看旧下载'])
		]);
		var scroll = E('div', { 'class': 'xa-scroll' });
		var logScroll = E('div', { 'class': 'xa-scroll xa-log-scroll', 'tabindex': '0', 'aria-label': '日志' });
		var logQuery = E('input', {
			'type': 'search',
			'class': 'cbi-input-text',
			'aria-label': '筛选日志',
			'placeholder': '筛选日志'
		});
		var logRaw = '';
		var logView = 'run';
		var logPinned = true;
		var lastSignature = '';
		var quickButton;
		var fullButton;
		var stopButton;
		var pendingIp = '';
		var pendingSnap = '';

		function stopSweep() {
			if (stopButton)
				stopButton.disabled = true;
			return fs.exec('/usr/sbin/xboxaccel', ['stop']).then(function(res) {
				var output = (res.stdout || '') + (res.stderr || '');
				if (res.code !== 0) {
					ui.addNotification(null, E('p', {}, [output || _('没能停止测速')]));
					return;
				}
				if (output.indexOf('idle') !== -1)
					ui.addNotification(null, E('p', {}, [_('当前没有正在进行的测速')]), 'info');
				return fs.read('/tmp/xboxaccel.status').then(function(next) {
					statusText = next;
					paint(next);
				}).catch(function() {});
			});
		}

		function startSweep(sweep) {
			var carrier = fieldValue('carrier') || 'any';
			var scheme = fieldValue('probe_scheme') || 'cn';
			return fs.exec('/usr/sbin/xboxaccel', ['test-bg', sweep, carrier, scheme]).then(function(res) {
				var output = (res.stdout || '') + (res.stderr || '');
				if (res.code !== 0) {
					ui.addNotification(null, E('p', {}, [output || _('测速未能启动')]));
					return;
				}
				if (output.indexOf('busy') !== -1)
					ui.addNotification(null, E('p', {}, [_('已有一轮测速在进行')]), 'info');
			});
		}

		function renderTable(text) {
			var parsed = parseStatus(text);
			var measured = {};
			var rows = [];
			var seen = {};
			var query = search.value.trim().toLowerCase();
			var filter = viewFilter.value;
			var staticMode = fieldValue('mode') === 'static' || (!fieldValue('mode') && parsed.mode === 'static');
			var serviceOn = Number(parsed.enabled) === 1 && parsed.reason !== 'disabled' && parsed.reason !== 'missing-ip';
			var maxBps = 1;
			var fastest = { primary: '', legacy: '' };

			(parsed.results || []).forEach(function(row) {
				measured[row.ip] = row;
				if (row.ok && Number(row.bps) > maxBps)
					maxBps = Number(row.bps);
			});
			catalog.forEach(function(node) {
				seen[node.ip] = true;
				rows.push({ node: node, measured: measured[node.ip] || null });
			});
			(parsed.results || []).forEach(function(row) {
				if (seen[row.ip])
					return;
				rows.push({
					node: { ip: row.ip, loc: row.loc || '', host: row.host || '', group: row.group || 'manual-primary' },
					measured: row
				});
			});
			rows.forEach(function(item) {
				var pool = poolOf(item.node.group);
				if (!item.measured || !item.measured.ok)
					return;
				if (!fastest[pool] || Number(item.measured.bps) > Number((measured[fastest[pool]] || {}).bps || 0))
					fastest[pool] = item.node.ip;
			});
			rows = rows.filter(function(item) {
				var blob = (item.node.loc + ' ' + item.node.ip + ' ' + groupName(item.node.group)).toLowerCase();
				var pool = poolOf(item.node.group);
				if (query && blob.indexOf(query) === -1)
					return false;
				if (filter === 'primary')
					return pool === 'primary';
				if (filter === 'legacy')
					return pool === 'legacy';
				if (filter === 'round' && (parsed.results || []).length)
					return !!item.measured || pendingIp === item.node.ip || parsed.probe_ip === item.node.ip || (serviceOn && (
						(pool === 'primary' && parsed.primary_ip === item.node.ip) ||
						(pool === 'legacy' && parsed.legacy_ip === item.node.ip)
					));
				return true;
			});
			rows.sort(function(a, b) {
				var ap = pendingIp === a.node.ip || (Number(parsed.running) === 1 && parsed.probe_ip === a.node.ip);
				var bp = pendingIp === b.node.ip || (Number(parsed.running) === 1 && parsed.probe_ip === b.node.ip);
				if (ap !== bp)
					return ap ? -1 : 1;
				var as = a.measured && a.measured.ok ? Number(a.measured.bps) : -1;
				var bs = b.measured && b.measured.ok ? Number(b.measured.bps) : -1;
				return bs - as;
			});

			if (!rows.length) {
				return E('p', { 'class': 'xa-empty' }, [_('没有可显示的节点。换一个筛选，或先测速。')]);
			}

			var speedTitle = parsed.probe_scheme === 'com' ? '.com 速度' : '.cn 速度';
			var table = E('table', { 'class': 'xa-table' }, [
				E('thead', {}, [
					E('tr', {}, ['线路', '位置', 'IP', speedTitle, '实收', '延迟', '结果', '操作'].map(function(title) {
						return E('th', { 'scope': 'col' }, [title]);
					}))
				])
			]);
			var body = E('tbody');
			rows.forEach(function(item) {
				var row = item.measured;
				var pool = poolOf(item.node.group);
				var activeIp = pool === 'legacy' ? parsed.legacy_ip : parsed.primary_ip;
				var using = serviceOn && activeIp === item.node.ip;
				var fastestHere = item.node.ip === fastest[pool];
				var liveMatch = Number(parsed.running) === 1 && parsed.sweep === 'once' && parsed.probe_ip === item.node.ip;
				var probing = pendingIp === item.node.ip || liveMatch;
				var busy = Number(parsed.running) === 1 || !!pendingIp;
				var label = !row ? '待测速' : (row.ok ? (fastestHere ? '最快' : '可用') : ('HTTP ' + (row.http || 0)));
				if (using)
					label = '使用中';
				if (probing)
					label = '测速中';
				var width = row && row.ok ? Math.max(4, Math.round(Number(row.bps) / maxBps * 100)) : 0;
				var got = liveMatch ? (Number(parsed.probe_bytes) || 0) : 0;
				var liveBps = liveMatch ? (Number(parsed.probe_bps) || 0) : 0;
				var cap = Number(parsed.probe_limit) || 8 * 1048576;
				var pct = cap ? Math.min(100, Math.round(got / cap * 100)) : 0;
				var speedCell = probing ? E('div', { 'class': 'xa-speed' }, [
					E('span', {}, [liveBps ? formatBytes(liveBps) : '连接中']),
					E('span', { 'class': 'xa-bar', 'aria-hidden': 'true' }, [
						E('span', { 'style': 'width:' + (pct || (liveBps ? 4 : 0)) + '%' })
					]),
					E('span', { 'class': 'xa-prog' }, [formatProgress(got) + ' / ' + formatProgress(cap)])
				]) : (row && row.ok ? E('div', { 'class': 'xa-speed' }, [
					E('span', {}, [formatBytes(row.bps)]),
					E('span', { 'class': 'xa-bar', 'aria-hidden': 'true' }, [
						E('span', { 'style': 'width:' + width + '%' })
					])
				]) : '—');
				var probe = E('button', {
					'type': 'button',
					'class': 'cbi-button',
					'aria-label': '测速 ' + item.node.ip,
					'disabled': busy ? 'disabled' : null
				}, [probing ? '测速中' : '测速']);
				probe.addEventListener('click', function() {
					if (Number(parseStatus(statusText).running) === 1 || pendingIp)
						return;
					pendingIp = item.node.ip;
					pendingSnap = statusText;
					paint(statusText);
					var scheme = fieldValue('probe_scheme') || 'cn';
					return fs.exec('/usr/sbin/xboxaccel', ['probe-bg', item.node.ip, scheme]).then(function(res) {
						var output = (res.stdout || '') + (res.stderr || '');
						if (res.code !== 0 || output.indexOf('busy') !== -1) {
							if (pendingIp === item.node.ip)
								pendingIp = '';
							paint(statusText);
							ui.addNotification(null, E('p', {}, [
								res.code !== 0 ? (output || _('测速未能启动')) : _('已有一轮测速在进行')
							]), res.code !== 0 ? undefined : 'info');
						}
					}).catch(function() {
						if (pendingIp === item.node.ip)
							pendingIp = '';
						paint(statusText);
					});
				});
				var action = E('button', {
					'type': 'button',
					'disabled': !staticMode || using ? 'disabled' : null
				}, [using ? '使用中' : (pool === 'legacy' ? '用于旧下载' : '用于主下载')]);
				action.addEventListener('click', function() {
					if (!staticMode || using)
						return;
					useNode(pool, item.node.ip, function() {
						return fs.read('/tmp/xboxaccel.status').then(function(next) {
							if (window.xboxaccelPaint)
								window.xboxaccelPaint(next);
						});
					});
				});
				body.appendChild(E('tr', { 'class': using ? 'is-using' : '' }, [
					E('td', {}, [groupName(item.node.group)]),
					E('td', {}, [item.node.loc || '']),
					E('td', { 'class': 'xa-ip' }, [item.node.ip]),
					E('td', {}, [speedCell]),
					E('td', {}, [liveMatch ? formatProgress(got) : (row ? formatSize(row.bytes) : '')]),
					E('td', {}, [row && row.conn_ms ? (row.conn_ms + ' ms') : '']),
					E('td', { 'class': row && !row.ok ? 'xa-bad' : '' }, [label]),
					E('td', {}, [E('div', { 'class': 'xa-actions' }, [probe, action])])
				]));
			});
			table.appendChild(body);
			return table;
		}

		function paint(text) {
			var parsed = parseStatus(text);
			if (pendingIp && text !== pendingSnap && Number(parsed.running) !== 1 && parsed.probe_ip === pendingIp)
				pendingIp = '';
			var signature = String(text) + '\n' + pendingIp + '\n' + search.value + '\n' + viewFilter.value + '\n' + fieldValue('mode');
			var running = Number(parsed.running) === 1;
			var liveOnce = running && parsed.sweep === 'once' && (!pendingIp || parsed.probe_ip === pendingIp);
			var when = parsed.time ? new Date(parsed.time * 1000).toLocaleString() : '';
			var progress = running && parsed.sweep !== 'once' && parsed.planned ? ('，' + (parsed.finished || 0) + ' / ' + parsed.planned) : '';
			var summary = (running ? '正在测速' : reasonText(parsed.reason)) + progress;
			if (pendingIp && !liveOnce) {
				summary = '正在测速 ' + pendingIp + ' · 连接中';
			}
			else if (liveOnce) {
				var liveBps = Number(parsed.probe_bps) || 0;
				var cap = Number(parsed.probe_limit) || 8 * 1048576;
				summary = '正在测速 ' + (parsed.probe_ip || pendingIp) + ' · ' +
					(liveBps ? formatBytes(liveBps) : '连接中') + ' · ' +
					formatProgress(parsed.probe_bytes) + ' / ' + formatProgress(cap);
			}
			else if (parsed.sweep === 'once')
				summary += ' · ' + (parsed.probe_ip || '单点');
			else if (parsed.sweep)
				summary += parsed.sweep === 'routine' ? ' · 快速' : ' · 完整';
			if (parsed.sweep && parsed.probe_scheme === 'com')
				summary += ' · .com 302';
			if (!running && parsed.probe_scheme === 'com' && Number(parsed.com_n) > 0 && parsed.com_avg)
				summary += ' · .com/.cn 平均 ' + Math.round(Number(parsed.com_avg) * 100) + '%' +
					'（最差 ' + Math.round(Number(parsed.com_min) * 100) + '%）' +
					(Number(parsed.com_warn) === 1 ? ' · 差距大' : '');
			if (!pendingIp && !liveOnce && parsed.sample_mib)
				summary += ' · 样本 ' + parsed.sample_mib + ' MB';
			if (when && !pendingIp && !liveOnce)
				summary += ' · ' + when;
			liveText.textContent = summary;
			dot.className = (running || pendingIp) ? 'xa-dot is-live' : 'xa-dot';
			primaryValue.textContent = parsed.primary_ip || '未选择';
			legacyValue.textContent = parsed.legacy_ip || '未选择';
			primaryReason.textContent = reasonText(parsed.primary_reason);
			legacyReason.textContent = reasonText(parsed.legacy_reason);
			modeValue.textContent = parsed.mode === 'dynamic' ? '动态' : '静态';
			modeReason.textContent = domains.length + ' 个域名';
			if (quickButton)
				quickButton.disabled = running || !!pendingIp;
			if (fullButton)
				fullButton.disabled = running || !!pendingIp;
			if (stopButton)
				stopButton.disabled = !(running || pendingIp);
			if (signature === lastSignature)
				return;
			lastSignature = signature;
			var top = scroll.scrollTop;
			while (scroll.firstChild)
				scroll.removeChild(scroll.firstChild);
			scroll.appendChild(renderTable(text));
			scroll.scrollTop = top;
		}

		window.xboxaccelPaint = paint;
		function paintLog(text) {
			var query = logQuery.value.trim().toLowerCase();
			var rows = parseLog(text).filter(function(row) {
				if (!query)
					return true;
				return (row.time + ' ' + logText(row.msg)).toLowerCase().indexOf(query) !== -1;
			});
			var table;
			var body;
			while (logScroll.firstChild)
				logScroll.removeChild(logScroll.firstChild);
			if (!rows.length) {
				logScroll.appendChild(E('p', { 'class': 'xa-empty' }, [
					query ? _('没有符合筛选的记录。') : (logView === 'conn' ? _('还没有连接记录。') : _('还没有运行记录。'))
				]));
				return;
			}
			table = E('table', { 'class': 'xa-table xa-log' }, [
				E('thead', {}, [
					E('tr', {}, [
						E('th', { 'scope': 'col' }, ['时间']),
						E('th', { 'scope': 'col' }, ['记录'])
					])
				])
			]);
			body = E('tbody');
			rows.forEach(function(row) {
				body.appendChild(E('tr', {}, [
					E('td', { 'class': 'xa-ip' }, [row.time || '—']),
					E('td', {}, [logText(row.msg)])
				]));
			});
			table.appendChild(body);
			logScroll.appendChild(table);
			if (logPinned)
				logScroll.scrollTop = logScroll.scrollHeight;
		}

		function fetchLog(kind) {
			var cmd = kind === 'conn' ? ['log', 'conn'] : ['log'];
			return fs.exec('/usr/sbin/xboxaccel', cmd).then(function(res) {
				if (res.code !== 0)
					return;
				logRaw = res.stdout || '';
				paintLog(logRaw);
			}).catch(function() {});
		}

		function pullLog() {
			logView = 'run';
			return fetchLog('run');
		}

		function pullConnLog() {
			logView = 'conn';
			return fetchLog('conn');
		}

		function refreshLog() {
			return fetchLog(logView);
		}

		function clearLog() {
			var conn = logView === 'conn';
			ui.showModal(conn ? _('清空连接日志') : _('清空日志'), [
				E('p', {}, [conn ? _('只清掉连接日志列表，已经生效的解析和运行日志不变。') : _('只清掉这个列表。系统里的其他日志不动，已经生效的解析也不变。')]),
				E('div', { 'class': 'right' }, [
					E('button', { 'class': 'btn', 'type': 'button', 'click': ui.hideModal }, [_('取消')]),
					E('button', {
						'class': 'btn cbi-button-negative',
						'type': 'button',
						'click': function(ev) {
							if (ev && ev.preventDefault)
								ev.preventDefault();
							ui.hideModal();
							fs.exec('/usr/sbin/xboxaccel', conn ? ['log', 'conn', 'clear'] : ['log', 'clear']).then(function() {
								logPinned = true;
								return refreshLog();
							});
						}
					}, [_('清空')])
				])
			]);
		}

		search.addEventListener('input', function() { paint(statusText); });
		viewFilter.addEventListener('change', function() { paint(statusText); });
		logQuery.addEventListener('input', function() { paintLog(logRaw); });
		logScroll.addEventListener('scroll', function() {
			logPinned = logScroll.scrollHeight - logScroll.scrollTop - logScroll.clientHeight < 28;
		});

		var m = new form.Map('xboxaccel', _('Xbox 下载选点'),
			_('主下载和旧下载分开选地址。只有把 DNS 指到本机 53 端口的设备会命中。定时巡检只测短名单，不会把全部节点重新拉一遍。'));
		var s = m.section(form.NamedSection, 'main', 'settings', _('服务'));
		s.option(form.Flag, 'enabled', _('启用'));

		var mode = s.option(form.ListValue, 'mode', _('模式'));
		mode.value('static', _('静态'));
		mode.value('dynamic', _('动态'));

		var interval = s.option(form.Value, 'interval', _('巡检间隔（分钟）'));
		interval.datatype = 'range(5,1440)';
		interval.placeholder = '30';
		interval.depends('mode', 'dynamic');
		interval.rmempty = false;

		var margin = s.option(form.Value, 'margin', _('切换阈值（%）'),
			_('新地址至少比当前地址快过这个百分比，动态模式才会更换。'));
		margin.datatype = 'range(0,90)';
		margin.placeholder = '20';
		margin.depends('mode', 'dynamic');
		margin.rmempty = false;

		var carrier = s.option(form.ListValue, 'carrier', _('运营商'),
			_('定时巡检和页面上的测速都按这里过滤。未保存时，按钮会用下拉框里当前的值。'));
		carrier.value('any', _('全部运营商'));
		carrier.value('telecom', _('电信'));
		carrier.value('unicom', _('联通'));
		carrier.value('mobile', _('移动'));
		carrier.rmempty = false;

		var pin = s.option(form.Flag, 'pin_global', _('国际域名跳转到国内域名'),
			_('打开后，.xboxlive.com 以及国内节点没有配置的 xvcf1/2.xboxlive.cn 解析到本机并 302 到节点认的 .cn 主机名，文件仍从选中的国内节点下载。关掉后这些名字恢复原来的解析。国内节点只认 .cn 的主机名，把 .com 或 xvcf 的 .cn 直接指到节点会被拒绝。保存后让主机重新连接无线，清掉已经缓存的地址。'));
		pin.default = '1';
		pin.rmempty = false;

		var probe = s.option(form.Button, '_probe', _('快速测速'),
			_('8 MB 样本，每条线路最多 10 个地址。定时巡检也用这个规模。'));
		probe.inputstyle = 'apply';
		probe.inputtitle = _('快速测速');
		probe.onclick = function() { return startSweep('routine'); };

		var full = s.option(form.Button, '_full', _('完整测速'),
			_('使用下面的样本大小，每条线路最多 24 个地址，并按城市分散抽取。'));
		full.inputstyle = 'action';
		full.inputtitle = _('完整测速');
		full.onclick = function() { return startSweep('thorough'); };

		var halt = s.option(form.Button, '_stop', _('停止测速'),
			_('停下这一轮测速。已经生效的地址保持不变。'));
		halt.inputstyle = 'negative';
		halt.inputtitle = _('停止测速');
		halt.onclick = function() { return stopSweep(); };

		var sample = m.section(form.NamedSection, 'main', 'settings', _('测速样本'));
		var scheme = sample.option(form.ListValue, 'probe_scheme', _('测速域名'),
			_('.cn 直连选点；.com 经本机 302 跳到同一个节点，用来对照 .com 路径的实际速度。'));
		scheme.value('cn', _('.cn 直连'));
		scheme.value('com', _('.com 经 302'));
		scheme.default = 'cn';
		scheme.rmempty = false;
		sample.option(form.Value, 'sample_host', _('手动地址使用的域名'),
			_('手动地址测速时用的 Host；批量测速的域名由上面的“测速域名”决定。填 .com 也会自动换成节点认的 .cn。'));
		sample.option(form.Value, 'sample_path', _('主下载路径')).placeholder = '/Z/routing/extraextralarge.txt';
		var legacyPath = sample.option(form.Value, 'sample_path_legacy', _('旧下载路径'),
			_('旧节点不提供 /Z/routing 样本，默认使用 XboxDownload 的 cn2 样本文件；留空时也用这个默认值。'));
		legacyPath.placeholder = '/public/content/...';
		var mib = sample.option(form.Value, 'sample_mib', _('完整测速样本（MB）'));
		mib.datatype = 'range(8,100)';
		mib.placeholder = '50';
		mib.rmempty = false;

		var c = m.section(form.GridSection, 'candidate', _('额外地址'),
			_('内置列表会自动参加。把同一个地址的「参与」关掉，即可从测速中排除。'));
		c.anonymous = true;
		c.addremove = true;
		c.sortable = false;
		c.option(form.Value, 'name', _('备注'));
		var ip = c.option(form.Value, 'ip', _('IP'));
		ip.datatype = 'ip4addr';
		ip.rmempty = false;
		var pool = c.option(form.ListValue, 'pool', _('线路'));
		pool.value('primary', _('主下载'));
		pool.value('legacy', _('旧下载'));
		pool.default = 'primary';
		var en = c.option(form.Flag, 'enabled', _('参与'));
		en.default = '1';
		en.editable = true;

		var live = m.section(form.NamedSection, 'main', 'settings', _('测速结果'));
		var board = live.option(form.DummyValue, '_board');
		board.render = function() {
			return E('div', {}, [
				E('div', { 'class': 'xa-tools' }, [search, viewFilter]),
				scroll
			]);
		};

		var journal = m.section(form.NamedSection, 'main', 'settings', _('运行日志'),
			_('运行日志记录选点、测速和解析；连接日志记录每次 .com/xvcf 302 请求的客户端、Host、路径和目标。只保留最近记录。'));
		var journalBoard = journal.option(form.DummyValue, '_journal');
		journalBoard.render = function() {
			return E('div', {}, [
				E('div', { 'class': 'xa-tools' }, [
					logQuery,
					E('button', {
						'type': 'button',
						'class': 'cbi-button',
						'click': function(ev) {
							if (ev && ev.preventDefault)
								ev.preventDefault();
							logPinned = true;
							return refreshLog();
						}
					}, [_('刷新')]),
					E('button', {
						'type': 'button',
						'class': 'cbi-button',
						'click': function(ev) {
							if (ev && ev.preventDefault)
								ev.preventDefault();
							logPinned = true;
							return pullLog();
						}
					}, [_('运行日志')]),
					E('button', {
						'type': 'button',
						'class': 'cbi-button',
						'click': function(ev) {
							if (ev && ev.preventDefault)
								ev.preventDefault();
							logPinned = true;
							return pullConnLog();
						}
					}, [_('连接日志')]),
					E('button', {
						'type': 'button',
						'class': 'cbi-button cbi-button-negative',
						'click': function(ev) {
							if (ev && ev.preventDefault)
								ev.preventDefault();
							clearLog();
						}
					}, [_('清空')])
				]),
				logScroll
			]);
		};

		var tabIds = ['run', 'nodes', 'log'];
		var tabNames = { run: '运行', nodes: '节点', log: '日志' };
		var tabBar = E('div', { 'class': 'xa-tabs', 'role': 'tablist', 'aria-label': '页面分区' });
		tabIds.forEach(function(id) {
			tabBar.appendChild(E('button', {
				'type': 'button',
				'class': 'cbi-button',
				'id': 'xa-tab-' + id,
				'role': 'tab',
				'aria-controls': 'xa-panel-' + id,
				'aria-selected': 'false',
				'tabindex': '-1'
			}, [tabNames[id]]));
		});

		function sectionName(section) {
			var title = section.querySelector('.cbi-section-title, h3, legend');
			return title ? title.textContent.replace(/\s+/g, ' ').trim() : '';
		}

		var panels = {};

		function showTab(id) {
			tabIds.forEach(function(key) {
				var on = key === id;
				var btn = tabBar.querySelector('#xa-tab-' + key);
				var panel = panels[key];
				if (btn) {
					btn.setAttribute('aria-selected', on ? 'true' : 'false');
					btn.tabIndex = on ? 0 : -1;
				}
				if (panel) {
					if (on)
						panel.removeAttribute('hidden');
					else
						panel.setAttribute('hidden', '');
				}
			});
			try {
				sessionStorage.setItem('xboxaccel-tab', id);
			} catch (e) {}
			if (id === 'log' && logPinned)
				logScroll.scrollTop = logScroll.scrollHeight;
		}

		tabBar.addEventListener('click', function(ev) {
			var btn = ev.target.closest ? ev.target.closest('[role="tab"]') : null;
			if (!btn || !tabBar.contains(btn))
				return;
			ev.preventDefault();
			showTab(btn.id.replace('xa-tab-', ''));
		});
		tabBar.addEventListener('keydown', function(ev) {
			var index = tabIds.indexOf((document.activeElement && document.activeElement.id || '').replace('xa-tab-', ''));
			if (index < 0)
				return;
			if (ev.key === 'ArrowRight')
				index = (index + 1) % tabIds.length;
			else if (ev.key === 'ArrowLeft')
				index = (index + tabIds.length - 1) % tabIds.length;
			else if (ev.key === 'Home')
				index = 0;
			else if (ev.key === 'End')
				index = tabIds.length - 1;
			else
				return;
			ev.preventDefault();
			showTab(tabIds[index]);
			tabBar.querySelector('#xa-tab-' + tabIds[index]).focus();
		});

		return m.render().then(function(node) {
			var tabOf = {
				'服务': 'run',
				'测速样本': 'nodes',
				'额外地址': 'nodes',
				'测速结果': 'nodes',
				'运行日志': 'log'
			};
			var actions = node.querySelector('.cbi-page-actions');
			var savedTab = 'run';
			tabIds.forEach(function(id) {
				panels[id] = E('div', {
					'class': 'xa-panel',
					'id': 'xa-panel-' + id,
					'role': 'tabpanel',
					'aria-labelledby': 'xa-tab-' + id
				});
			});
			Array.prototype.slice.call(node.querySelectorAll('.cbi-section')).forEach(function(section) {
				var key = tabOf[sectionName(section)] || 'run';
				panels[key].appendChild(section);
			});
			var first = node.querySelector('.cbi-section, .cbi-page-actions');
			if (first)
				node.insertBefore(tabBar, first);
			else
				node.appendChild(tabBar);
			tabIds.forEach(function(id) {
				if (actions)
					node.insertBefore(panels[id], actions);
				else
					node.appendChild(panels[id]);
			});
			try {
				savedTab = sessionStorage.getItem('xboxaccel-tab') || 'run';
			} catch (e) {}
			if (tabIds.indexOf(savedTab) < 0)
				savedTab = 'run';
			showTab(savedTab);
			quickButton = node.querySelector('#cbi-xboxaccel-main-_probe input, #cbi-xboxaccel-main-_probe button');
			fullButton = node.querySelector('#cbi-xboxaccel-main-_full input, #cbi-xboxaccel-main-_full button');
			stopButton = node.querySelector('#cbi-xboxaccel-main-_stop input, #cbi-xboxaccel-main-_stop button');
			var modeEl = fieldBox('mode');
			if (modeEl)
				modeEl.addEventListener('change', function() { paint(statusText); });
			paint(statusText);
			paintLog('');
			pullLog();
			var pollTick = 0;
			function pullStatus() {
				return fs.read('/tmp/xboxaccel.status').then(function(text) {
					statusText = text;
					paint(text);
				}).catch(function() {});
			}
			poll.add(function() {
				if (document.hidden)
					return;
				pollTick += 1;
				var jobs = [pullStatus()];
				if (pollTick % 3 === 1)
					jobs.push(refreshLog());
				return Promise.all(jobs);
			}, 1);
			window.setInterval(function() {
				if (document.hidden)
					return;
				var live = pendingIp || Number(parseStatus(statusText).running) === 1;
				if (live)
					pullStatus();
			}, 300);
			return E('div', { 'class': 'xa-shell' }, [
				E('link', { 'rel': 'stylesheet', 'href': L.resource('view/xboxaccel.css') + '?v=1' }),
				E('div', { 'class': 'xa-hero' }, [
					E('div', {}, [
						E('p', { 'class': 'xa-kicker' }, ['Xbox 下载']),
						E('p', { 'class': 'xa-live' }, [dot, liveText])
					])
				]),
				E('div', { 'class': 'xa-metrics' }, [
					E('section', { 'class': 'xa-tile' }, [E('p', { 'class': 'xa-k' }, ['主下载']), primaryValue, primaryReason]),
					E('section', { 'class': 'xa-tile' }, [E('p', { 'class': 'xa-k' }, ['旧下载']), legacyValue, legacyReason]),
					E('section', { 'class': 'xa-tile' }, [E('p', { 'class': 'xa-k' }, ['模式']), modeValue, modeReason]),
					E('section', { 'class': 'xa-tile' }, [
						E('p', { 'class': 'xa-k' }, ['范围']),
						E('p', { 'class': 'xa-v' }, ['仅本机 53 端口']),
						E('p', { 'class': 'xa-s' }, ['跳转不占用管理页的 80 端口'])
					])
				]),
				node
			]);
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
