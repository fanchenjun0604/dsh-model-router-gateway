window.__ModuleLoader__.load({
  id: 'dsh-model-router-gateway',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback } = React;

    const NS = 'dsh-model-router-gateway';
    const PKG = 'dsh-model-router-gateway';
    const ROW_ID = 'dsh-model-router-gateway';
    const ROW_CONFIG_KEY = PKG + '#' + ROW_ID;
    const BASE = '/api/model-router-gateway';

    // ---------------------------------------------------------------- styles

    const styles = {
      page: { padding: '4px 2px', fontFamily: 'inherit', color: 'inherit' },
      row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
      card: {
        border: '1px solid var(--dsw-alias-border, #e5e7eb)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
        background: 'var(--dsw-alias-surface, transparent)',
      },
      input: {
        width: '100%',
        boxSizing: 'border-box',
        padding: '6px 8px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border, #d1d5db)',
        background: 'var(--dsw-alias-input, transparent)',
        color: 'inherit',
        fontSize: 13,
      },
      btn: {
        border: '1px solid var(--dsw-alias-border, #d1d5db)',
        borderRadius: 6,
        padding: '5px 10px',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        fontSize: 13,
      },
      btnPrimary: {
        border: 'none',
        borderRadius: 6,
        padding: '6px 12px',
        background: '#4f46e5',
        color: '#fff',
        cursor: 'pointer',
        fontSize: 13,
      },
      btnDanger: {
        border: 'none',
        borderRadius: 6,
        padding: '5px 10px',
        background: '#ef4444',
        color: '#fff',
        cursor: 'pointer',
        fontSize: 12,
      },
      muted: { opacity: 0.65, fontSize: 12 },
      chip: {
        display: 'inline-block',
        borderRadius: 10,
        padding: '1px 8px',
        fontSize: 12,
        marginRight: 6,
        marginBottom: 4,
        background: 'rgba(79,70,229,0.12)',
        color: '#4f46e5',
      },
      label: { fontSize: 12, opacity: 0.75, marginBottom: 4 },
      providerHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '6px 0',
        borderBottom: '1px solid var(--dsw-alias-border, #eee)',
        cursor: 'pointer',
      },
      modelGrid: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px 12px',
        padding: '8px 0',
        maxHeight: 220,
        overflowY: 'auto',
      },
      check: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, minWidth: 160 },
      chipBig: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        borderRadius: 12,
        padding: '4px 10px',
        fontSize: 14,
        marginRight: 8,
        marginBottom: 6,
        background: 'rgba(79,70,229,0.12)',
        color: '#4f46e5',
      },
      orderBtn: {
        border: '1px solid var(--dsw-alias-border, #d1d5db)',
        borderRadius: 6,
        padding: '3px 9px',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        fontSize: 14,
        lineHeight: '16px',
      },
      dragHandle: {
        cursor: 'grab',
        opacity: 0.55,
        fontSize: 15,
        padding: '0 4px',
        userSelect: 'none',
      },
      editingCard: {
        border: '2px solid #4f46e5',
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
        background: 'rgba(79,70,229,0.06)',
      },
      docsPre: {
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontSize: 13,
        lineHeight: 1.55,
        margin: 0,
        fontFamily: 'inherit',
        maxHeight: 420,
        overflowY: 'auto',
      },
    };

    // ---------------------------------------------------- display-name maps

    /** provider id -> display name, from /config providers. */
    function buildProviderNames(providers) {
      const map = {};
      for (const p of providers || []) {
        if (p && p.id && p.name) map[p.id] = p.name;
      }
      return map;
    }

    /** provider id -> { model id -> display name }. */
    function buildModelNames(providers) {
      const map = {};
      for (const p of providers || []) {
        if (!p || !p.id || !Array.isArray(p.models)) continue;
        const inner = {};
        for (const m of p.models) {
          if (m && m.id && m.name && m.name !== m.id) inner[m.id] = m.name;
        }
        map[p.id] = inner;
      }
      return map;
    }

    /** "provider/model" -> human label, falling back to the raw ids. */
    function modelLabel(providerNames, modelNames, provider, model) {
      const pid = providerNames[provider] || provider;
      const mid = (modelNames[provider] && modelNames[provider][model]) || model;
      return `${pid} · ${mid}`;
    }

    // ------------------------------------------------ minimal markdown text

    /**
     * Very small markdown subset, returned as plain strings composed with the
     * `h()` callsite: headings/bold/inline code are flattened, fenced blocks
     * keep their text with a marker, tables degrade to row-per-line text.
     * No HTML is ever produced from the markdown itself (data, not code).
     */
    function markdownToText(md) {
      const out = [];
      let inFence = false;
      for (const raw of String(md || '').split(/\r?\n/)) {
        const line = raw;
        if (/^```/.test(line.trim())) {
          inFence = !inFence;
          out.push(inFence ? '┌ ' : '└─');
          continue;
        }
        if (inFence) {
          out.push('   ' + line);
          continue;
        }
        let t = line;
        t = t.replace(/^#{1,6}\s*/, '');
        t = t.replace(/^\s*[*+-]\s/, '• ');
        t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
        t = t.replace(/`([^`]+)`/g, '$1');
        t = t.replace(/^>\s?/, '');
        const link = t.match(/\[([^\]]+)\]\((https?:[^)]+)\)/);
        if (link) t = t.replace(link[0], `${link[1]} (${link[2]})`);
        if (/^\s*\|?\s*:?-{2,}/.test(t)) continue;
        out.push(t);
      }
      return out.join('\n');
    }

    // ---------------------------------------------------------------- helpers

    async function fetchJson(url, options) {
      const res = await fetch(url, options);
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        throw new Error(
          (data && data.error && data.error.message) || data?.error || text || `HTTP ${res.status}`,
        );
      }
      return data;
    }

    // ------------------------------------------------------------------- view

    function ModelRouterGatewayCard(props) {
      const view = props && props.view;
      const React_ = React;
      const useRef = React_.useRef;
      const useMemo = React_.useMemo;
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState('');
      const [config, setConfig] = useState(null);
      const [routes, setRoutes] = useState([]);
      const [providers, setProviders] = useState([]);
      const [keyDraft, setKeyDraft] = useState('');
      const [visibility, setVisibility] = useState({});
      const [expanded, setExpanded] = useState({});
      const [editing, setEditing] = useState(null);
      const [draftId, setDraftId] = useState('');
      const [draftName, setDraftName] = useState('');
      const [draftModels, setDraftModels] = useState([{ provider: '', model: '' }]);
      const [settingsDraft, setSettingsDraft] = useState({
        defaultTimeoutMs: 60000,
        maxRetryPerModel: 1,
        failureCooldownMs: 60000,
      });
      const [open, setOpen] = useState(view === 'page');
      const [saving, setSaving] = useState(false);
      const [update, setUpdate] = useState(null);
      const [cooldowns, setCooldowns] = useState([]);
      const [checking, setChecking] = useState(false);
      const [copied, setCopied] = useState('');
      const [dragOver, setDragOver] = useState(-1);
      const [docsOpen, setDocsOpen] = useState(false);
      const [docsText, setDocsText] = useState('');
      const [docsLoading, setDocsLoading] = useState(false);
      const [formOpen, setFormOpen] = useState(false);
      const editFormRef = useRef(null);
      const moveTimer = useRef(null);

      const providerNames = useMemo(() => buildProviderNames(providers), [providers]);
      const modelNames = useMemo(() => buildModelNames(providers), [providers]);

      const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
          const data = await fetchJson(BASE + '/config');
          setConfig(data);
          setRoutes(Array.isArray(data.routes) ? data.routes : []);
          setProviders(Array.isArray(data.providers) ? data.providers : []);
          setKeyDraft(data.masked ? '' : data.gatewayKey || '');
          if (data.update) setUpdate(data.update);
          setCooldowns(Array.isArray(data.cooldowns) ? data.cooldowns : []);
          const st = data.settings || {};
          setSettingsDraft({
            defaultTimeoutMs: typeof st.defaultTimeoutMs === 'number' ? st.defaultTimeoutMs : 60000,
            maxRetryPerModel: typeof st.maxRetryPerModel === 'number' ? st.maxRetryPerModel : 1,
            failureCooldownMs: typeof st.failureCooldownMs === 'number' ? st.failureCooldownMs : 60000,
          });
          const vis = {};
          const raw = data.modelVisibility || {};
          for (const [pid, list] of Object.entries(raw)) {
            if (Array.isArray(list)) vis[pid] = list.map(String);
          }
          setVisibility(vis);
        } catch (e) {
          setError(e && e.message ? e.message : String(e));
        } finally {
          setLoading(false);
        }
      }, []);

      useEffect(() => {
        load();
      }, [load]);

      const masked = !!(config && config.masked);
      const savedKey = masked ? '' : config && config.gatewayKey ? config.gatewayKey : '';
      const origin =
        typeof globalThis !== 'undefined' && globalThis.location
          ? globalThis.location.origin
          : '';
      const publicPort = config && typeof config.publicPort === 'number' ? config.publicPort : 0;
      const lanIps = (config && config.lanIps) || [];
      const lanIp = lanIps[0] || '';
      let phoneBase;
      if (publicPort > 0) {
        phoneBase = lanIp
          ? `http://${lanIp}:${publicPort}/v1`
          : `http://<host-ip>:${publicPort}/v1`;
      } else {
        phoneBase = origin + BASE + '/v1';
      }

      // ---------------- route CRUD ----------------

      function resetDraft() {
        setEditing(null);
        setDraftId('');
        setDraftName('');
        setDraftModels([{ provider: '', model: '' }]);
        setFormOpen(false);
      }

      function startEdit(route) {
        setEditing(route);
        setFormOpen(true);
        setDraftId(route.id || '');
        setDraftName(route.name || '');
        const models = Array.isArray(route.models) && route.models.length
          ? route.models.map((m) => ({ provider: m.provider || '', model: m.model || '' }))
          : [{ provider: '', model: '' }];
        setDraftModels(models);
        setOpen(true);
        // The edit form lives at the bottom of a long card; bring it into
        // view, otherwise the click looks like it did nothing.
        setTimeout(() => {
          try {
            if (editFormRef.current && editFormRef.current.scrollIntoView) {
              editFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          } catch {
            /* scroll is a convenience only */
          }
        }, 60);
      }

      function suggestId(name) {
        return String(name || '')
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 40);
      }

      async function saveRoute() {
        setError('');
        const models = draftModels
          .map((m) => ({
            provider: String(m.provider || '').trim(),
            model: String(m.model || '').trim(),
          }))
          .filter((m) => m.provider && m.model);
        if (!models.length) {
          setError('至少配置一个模型 / add at least one model');
          return;
        }
        const name = draftName.trim() || (editing ? editing.name : 'new route');
        const headers = {
          'content-type': 'application/json',
          authorization: `Bearer ${savedKey}`,
        };
        try {
          if (editing) {
            await fetchJson(BASE + '/admin/routes/' + encodeURIComponent(editing.id), {
              method: 'PUT',
              headers,
              body: JSON.stringify({ name, models }),
            });
          } else {
            const id = draftId.trim() || suggestId(name);
            if (!id) {
              setError('请填写路由 ID，或输入一个英文/数字名称自动生成');
              return;
            }
            await fetchJson(BASE + '/admin/routes', {
              method: 'POST',
              headers,
              body: JSON.stringify({ id, name, models }),
            });
          }
          resetDraft();
          await load();
        } catch (e) {
          setError(e && e.message ? e.message : String(e));
        }
      }

      async function removeRoute(route) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.confirm === 'function') {
          if (!globalThis.confirm(`删除路由组「${route.name || route.id}」？`)) return;
        }
        try {
          await fetchJson(BASE + '/admin/routes/' + encodeURIComponent(route.id), {
            method: 'DELETE',
            headers: { authorization: `Bearer ${savedKey}` },
          });
          await load();
        } catch (e) {
          setError(e && e.message ? e.message : String(e));
        }
      }

      async function toggleRoute(route) {
        try {
          await fetchJson(BASE + '/admin/routes/' + encodeURIComponent(route.id), {
            method: 'PUT',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${savedKey}`,
            },
            body: JSON.stringify({ enabled: route.enabled === false }),
          });
          await load();
        } catch (e) {
          setError(e && e.message ? e.message : String(e));
        }
      }

      // ---------------- chain ordering ----------------

      /**
       * Reorder a saved chain: swap locally first (instant visual feedback),
       * then PUT the final order debounced. Rapid clicks coalesce into one
       * request; failure falls back to a full reload so the UI never lies.
       */
      function moveRouteModel(route, index, dir) {
        const models = (route.models || []).slice();
        const j = index + dir;
        if (j < 0 || j >= models.length) return;
        const t = models[index];
        models[index] = models[j];
        models[j] = t;
        const moved = { ...route, models };
        setRoutes((prev) => prev.map((r) => (r.id === route.id ? moved : r)));
        if (editing && editing.id === route.id) setDraftModels(models.map((m) => ({ ...m })));
        if (moveTimer.current) clearTimeout(moveTimer.current);
        moveTimer.current = setTimeout(async () => {
          moveTimer.current = null;
          try {
            await fetchJson(BASE + '/admin/routes/' + encodeURIComponent(route.id), {
              method: 'PUT',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${savedKey}`,
              },
              body: JSON.stringify({ models }),
            });
            await load();
          } catch (e) {
            setError(e && e.message ? e.message : String(e));
            await load();
          }
        }, 350);
      }

      // cleanup the debounce timer on unmount
      useEffect(() => () => {
        if (moveTimer.current) clearTimeout(moveTimer.current);
      }, []);

      function moveDraft(index, dir) {
        const next = draftModels.slice();
        const j = index + dir;
        if (j < 0 || j >= next.length) return;
        const t = next[index];
        next[index] = next[j];
        next[j] = t;
        setDraftModels(next);
      }

      // HTML5 drag & drop for the draft chain (local-only until saved).
      // A ref survives re-renders mid-drag; a plain variable would reset.
      const dragFrom = useRef(-1);

      function draftDragStart(e, index) {
        dragFrom.current = index;
        try {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(index));
        } catch {
          /* some webviews restrict dataTransfer; dragFrom still works */
        }
      }

      function draftDragOver(e, index) {
        if (dragFrom.current < 0 || index === dragFrom.current) return;
        e.preventDefault();
        try {
          e.dataTransfer.dropEffect = 'move';
        } catch {
          /* optional */
        }
        // Skip the state write when unchanged: a re-render mid-drag must
        // never shift layout under the cursor, or the drop is cancelled.
        if (dragOver !== index) setDragOver(index);
      }

      function draftDrop(e, index) {
        e.preventDefault();
        setDragOver(-1);
        const from = dragFrom.current;
        dragFrom.current = -1;
        if (from < 0 || from === index) return;
        const next = draftModels.slice();
        const [item] = next.splice(from, 1);
        // Removing the dragged row already shifted every row below it up
        // one slot, so the drop target's current index IS the landing slot
        // in both directions (the classic +/-1 trap).
        next.splice(index, 0, item);
        setDraftModels(next);
      }

      function draftDragEnd() {
        dragFrom.current = -1;
        setDragOver(-1);
      }

      // ---------------- docs (bundled guide) ----------------

      async function toggleDocs() {
        const next = !docsOpen;
        setDocsOpen(next);
        if (next && !docsText && !docsLoading) {
          setDocsLoading(true);
          try {
            // /docs is static bundled content (no config inside), served
            // outside the auth fence: works on masked and unmasked views.
            const data = await fetchJson(BASE + '/docs');
            setDocsText(markdownToText(data.markdown));
          } catch (e) {
            setError(e && e.message ? e.message : String(e));
            setDocsOpen(false);
          } finally {
            setDocsLoading(false);
          }
        }
      }

      // ---------------- self update ----------------

      async function checkUpdate() {
        setChecking(true);
        setError('');
        try {
          const data = await fetchJson(BASE + '/admin/update/check', {
            method: 'POST',
            headers: { authorization: `Bearer ${savedKey}` },
          });
          setUpdate(data.update);
        } catch (e) {
          setError(e && e.message ? e.message : String(e));
        } finally {
          setChecking(false);
        }
      }

      async function startUpgrade() {
        if (typeof globalThis !== 'undefined' && typeof globalThis.confirm === 'function') {
          if (!globalThis.confirm('立即升级到新版本？升级期间当前请求可能中断。')) return;
        }
        setError('');
        try {
          const data = await fetchJson(BASE + '/admin/update', {
            method: 'POST',
            headers: { authorization: `Bearer ${savedKey}` },
          });
          setUpdate(data.update);
          if (!data.ok) setError(data.reason || 'upgrade refused');
        } catch (e) {
          setError(e && e.message ? e.message : String(e));
        }
      }

      // ---------------- copy helpers ----------------

      function copyText(label, value) {
        try {
          const nav = typeof globalThis !== 'undefined' ? globalThis.navigator : undefined;
          if (nav && nav.clipboard && nav.clipboard.writeText) {
            nav.clipboard.writeText(value).then(
              () => {
                setCopied(label);
                setTimeout(() => setCopied(''), 1500);
              },
              () => setError('复制失败 / copy failed'),
            );
            return;
          }
        } catch {
          /* fall through */
        }
        setError('当前环境不支持剪贴板');
      }

      // ---------------- visibility ----------------

      function providerModels(pid) {
        const p = providers.find((x) => x.id === pid);
        return p && Array.isArray(p.models) ? p.models : [];
      }

      function isChecked(pid, mid) {
        const v = visibility[pid];
        if (v === undefined) return true;
        return v.includes(mid);
      }

      function setProviderSelection(pid, selected) {
        const all = providerModels(pid).map((m) => m.id);
        const next = { ...visibility };
        if (selected.length >= all.length) {
          delete next[pid];
        } else {
          next[pid] = selected;
        }
        setVisibility(next);
      }

      function toggleModel(pid, mid) {
        const all = providerModels(pid).map((m) => m.id);
        const current = visibility[pid] === undefined ? [...all] : [...visibility[pid]];
        const next = current.includes(mid)
          ? current.filter((x) => x !== mid)
          : [...current, mid];
        setProviderSelection(pid, next);
      }

      function selectAllProvider(pid) {
        const next = { ...visibility };
        delete next[pid];
        setVisibility(next);
      }

      function clearProvider(pid) {
        setVisibility({ ...visibility, [pid]: [] });
      }

      function invertProvider(pid) {
        const all = providerModels(pid).map((m) => m.id);
        const current = new Set(visibility[pid] === undefined ? all : visibility[pid]);
        setProviderSelection(pid, all.filter((id) => !current.has(id)));
      }

      function showAllModels() {
        setVisibility({});
      }

      function normalizeVisibility() {
        const out = {};
        for (const p of providers) {
          const v = visibility[p.id];
          if (v === undefined) continue;
          out[p.id] = Array.isArray(v) ? v : [];
        }
        return out;
      }

      async function saveForwarding() {
        setSaving(true);
        setError('');
        try {
          const body = {
            modelVisibility: normalizeVisibility(),
            settings: {
              defaultTimeoutMs: Number(settingsDraft.defaultTimeoutMs) || 60000,
              maxRetryPerModel: Number(settingsDraft.maxRetryPerModel) || 0,
              failureCooldownMs: Number(settingsDraft.failureCooldownMs) || 0,
            },
          };
          const k = keyDraft.trim();
          if (k) body.gatewayKey = k;
          await fetchJson(BASE + '/admin/settings', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${savedKey}`,
            },
            body: JSON.stringify(body),
          });
          await load();
        } catch (e) {
          setError(e && e.message ? e.message : String(e));
        } finally {
          setSaving(false);
        }
      }

      if (view === 'summary') {
        return h(
          'span',
          { style: styles.muted },
          `${routes.length} 个降级路由组 / fallback route groups`,
        );
      }

      const header = h(
        'button',
        {
          type: 'button',
          onClick: () => setOpen((v) => !v),
          style: {
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: '4px 0',
            fontSize: 14,
            fontWeight: 600,
          },
          'aria-expanded': open,
        },
        h('span', null, '模型路由网关 / Model Router Gateway'),
        h('span', { style: { opacity: 0.6, fontSize: 12 } }, open ? '收起' : '展开'),
      );

      if (!open) return h('div', { style: styles.page }, header);

      if (loading) {
        return h('div', { style: styles.page }, header, h('div', { style: styles.muted }, '加载中…'));
      }

      return h(
        'div', { style: styles.page },
        header,
        error
          ? h('div', { style: { color: '#dc2626', fontSize: 13, margin: '6px 0' } }, error)
          : null,

        // -------- intro: one sentence, then the full guide right below it --------
        h('div', { style: { ...styles.card, marginTop: 6 } },
          h('div', { style: { fontSize: 13, lineHeight: 1.5 } },
            '把 DSH 能调用的所有模型组成顺序降级链，用一个 OpenAI 兼容网关（BaseURL + Key）暴露给手机和任何外部客户端——模型 A 没额度/限流/报错时无感切到 B，对话不中断。'),
          h('div', {
            style: { ...styles.providerHeader, borderBottom: 'none', cursor: 'pointer', marginTop: 6 },
            onClick: toggleDocs,
          },
            h('div', { style: { fontWeight: 600 } }, '完整使用说明 / Full guide'),
            h('span', { style: styles.muted }, docsOpen ? '收起' : '展开'),
          ),
          docsOpen
            ? h('pre', { style: styles.docsPre },
                docsLoading ? '加载中…' : (docsText || '（文档不可用）'))
            : null,
        ),

        // -------- gateway --------
        h('div', { style: styles.card },
          h('div', { style: { fontWeight: 600, marginBottom: 6 } }, '网关地址与 Key / Gateway URL & Key'),
          h('div', { style: styles.label }, 'BaseURL'),
          h('div', { style: styles.row },
            h('input', { readOnly: true, value: phoneBase, style: { ...styles.input, flex: 1 } }),
            h('button', { type: 'button', style: styles.btn, onClick: () => copyText('base', phoneBase) }, copied === 'base' ? '已复制' : '复制'),
          ),
          publicPort > 0 && lanIp
            ? h('div', { style: { ...styles.muted, marginTop: 4 } },
                `本机调试 / local: http://127.0.0.1:${publicPort}/v1`)
            : null,
          h('div', { style: { ...styles.label, marginTop: 8 } },
            '外部访问 Key（可自定义，任意字符串） / Gateway key (any string)'),
          h('div', { style: styles.row },
            h('input', {
              value: masked ? '' : keyDraft,
              onChange: (e) => setKeyDraft(e.target.value),
              disabled: masked,
              placeholder: masked
                ? '••••（匿名视图，无法查看/修改）'
                : 'sk-... or any string',
              style: { ...styles.input, flex: 1, minWidth: 200 },
            }),
            masked || !savedKey
              ? null
              : h('button', { type: 'button', style: styles.btn, onClick: () => copyText('key', savedKey) }, copied === 'key' ? '已复制' : '复制当前'),
          ),
          h('div', { style: { ...styles.muted, marginTop: 6 } },
            masked
              ? '当前为受限视图：完整 Key 与编辑功能只在 DSH 本机或已登录会话中开放。'
              : '客户端填 BaseURL + Key（Authorization: Bearer <Key>），改完点下方"保存设置"。'),
          // -------- advanced knobs --------
          masked
            ? null
            : h('div', { style: { fontWeight: 600, margin: '12px 0 6px' } }, '高级设置 / Advanced'),
          masked
            ? null
            : h('div', { style: styles.row },
            h('div', { style: { flex: 1, minWidth: 150 } },
              h('div', { style: styles.label }, '单模型超时(ms) / Timeout'),
              h('input', {
                type: 'number',
                min: 1000,
                value: settingsDraft.defaultTimeoutMs,
                onChange: (e) => setSettingsDraft({ ...settingsDraft, defaultTimeoutMs: e.target.value }),
                style: styles.input,
              }),
            ),
            h('div', { style: { flex: 1, minWidth: 150 } },
              h('div', { style: styles.label }, '每模型重试 / Retry'),
              h('input', {
                type: 'number',
                min: 0,
                max: 5,
                value: settingsDraft.maxRetryPerModel,
                onChange: (e) => setSettingsDraft({ ...settingsDraft, maxRetryPerModel: e.target.value }),
                style: styles.input,
              }),
            ),
            h('div', { style: { flex: 1, minWidth: 150 } },
              h('div', { style: styles.label }, '失败冷却(ms) / Cooldown'),
              h('input', {
                type: 'number',
                min: 0,
                value: settingsDraft.failureCooldownMs,
                onChange: (e) => setSettingsDraft({ ...settingsDraft, failureCooldownMs: e.target.value }),
                style: styles.input,
              }),
            ),
          ),
          h('div', { style: { ...styles.muted, marginTop: 6 } },
            '模型失败后在冷却期内被路由直接跳过，不再浪费超时等待；0=关闭冷却。'),
        ),

        // -------- routes --------
        h('div', { style: { fontWeight: 600, margin: '8px 0 6px' } }, '路由组 / Route groups'),
        routes.length === 0
          ? h('div', { style: styles.muted }, '暂无路由组，请在下方新建。')
          : routes.map((route) =>
              h('div', { key: route.id, style: styles.card },
                h('div', { style: { ...styles.row, justifyContent: 'space-between' } },
                  h('div', null,
                    h('div', { style: { fontWeight: 600 } }, route.name || route.id),
                    h('div', { style: styles.muted },
                      `${route.enabled === false ? '已禁用' : '运行中'} · ${(route.models || []).length} 个模型`),
                  ),
                  h('div', { style: styles.row },
                    masked
                      ? null
                      : h('button', { type: 'button', style: styles.btn, onClick: () => startEdit(route) }, '编辑'),
                    masked
                      ? null
                      : h('button', {
                          type: 'button',
                          style: styles.btn,
                          onClick: () => toggleRoute(route),
                        }, route.enabled === false ? '启用' : '禁用'),
                    masked
                      ? null
                      : h('button', { type: 'button', style: styles.btnDanger, onClick: () => removeRoute(route) }, '删除'),
                  ),
                ),
                h('div', { style: { marginTop: 6, flexWrap: 'wrap' } },
                  (route.models || []).map((m, i) => {
                    const key = `${m.provider}/${m.model}`;
                    const cooling = (cooldowns || []).find((c) => c.model === key);
                    const last = i === (route.models || []).length - 1;
                    return h('span', {
                      key: i,
                      style: {
                        ...styles.chipBig,
                        ...(cooling ? { background: 'rgba(220,38,38,0.12)', color: '#dc2626' } : {}),
                      },
                      title: cooling ? `冷却中 ${cooling.remainingSec}s` : key,
                    }, [
                      `${i + 1}. ${modelLabel(providerNames, modelNames, m.provider, m.model)}${cooling ? ` ⏳${cooling.remainingSec}s` : ''}`,
                      masked || i === 0
                        ? null
                        : h('button', {
                            type: 'button',
                            'aria-label': '上移',
                            title: '上移',
                            onClick: (e) => { e.stopPropagation(); moveRouteModel(route, i, -1); },
                            style: styles.orderBtn,
                          }, '↑'),
                      masked || last
                        ? null
                        : h('button', {
                            type: 'button',
                            'aria-label': '下移',
                            title: '下移',
                            onClick: (e) => { e.stopPropagation(); moveRouteModel(route, i, 1); },
                            style: styles.orderBtn,
                          }, '↓'),
                    ]);
                  }),
                ),
              ),
            ),

        // -------- new / edit route (collapsed by default) --------
        h('div', {
          ref: editFormRef,
          style: {
            ...(editing ? styles.editingCard : styles.card),
            marginTop: 12,
            display: masked ? 'none' : 'block',
          },
        },
          h('div', {
            style: { ...styles.providerHeader, borderBottom: formOpen ? styles.providerHeader.borderBottom : 'none', cursor: 'pointer' },
            onClick: () => setFormOpen((v) => !v),
          },
            h('div', { style: { fontWeight: 600, color: editing ? '#4f46e5' : undefined } },
              editing ? `✎ 正在编辑路由组：${editing.name || editing.id}` : '新建路由组 / New route group'),
            h('span', { style: styles.muted }, formOpen ? '收起' : '展开'),
          ),
          formOpen
            ? h('div', null,
          editing
            ? h('div', { style: { ...styles.muted, marginTop: 4, marginBottom: 8 } },
                '改动仅在此表单内，点“保存”才会生效；“取消编辑”回到收起状态。')
            : null,
          h('div', { style: styles.label },
            editing ? 'ID（创建后不可修改，手机端以此寻址） / ID (fixed after create)' : 'ID（手机端 model 字段填它；留空自动从名称生成） / ID (the model name clients call)'),
          h('input', {
            value: draftId,
            readOnly: !!editing,
            onChange: (e) => setDraftId(e.target.value),
            placeholder: '例如：default / fast / coding',
            style: { ...styles.input, ...(editing ? { opacity: 0.6 } : {}) },
          }),
          h('div', { style: { ...styles.label, marginTop: 10 } }, '名称 / Name'),
          h('input', {
            value: draftName,
            onChange: (e) => setDraftName(e.target.value),
            placeholder: '例如：默认降级路由',
            style: styles.input,
          }),
          h('div', { style: { ...styles.label, marginTop: 10 } },
            '模型序列（按顺序尝试，失败自动切换下一个；拖 ⠿ 或点箭头调序）/ Ordered fallback chain (drag ⠿ or use arrows)'),
          draftModels.map((m, i) =>
            h('div', {
              key: i,
              draggable: true,
              onDragStart: (e) => draftDragStart(e, i),
              onDragOver: (e) => draftDragOver(e, i),
              onDrop: (e) => draftDrop(e, i),
              onDragEnd: draftDragEnd,
              style: {
                ...styles.row,
                marginBottom: 6,
                padding: dragOver === i ? '0 0 0 0' : undefined,
                borderTop: dragOver === i && i < dragFrom.current ? '2px solid #4f46e5' : '2px solid transparent',
                borderBottom: dragOver === i && dragFrom.current >= 0 && i > dragFrom.current ? '2px solid #4f46e5' : undefined,
              },
            },
              h('span', { style: styles.dragHandle, title: '拖动排序' }, '⠿'),
              h('select', {
                value: m.provider,
                onChange: (e) => {
                  const next = draftModels.slice();
                  next[i] = { ...next[i], provider: e.target.value, model: '' };
                  setDraftModels(next);
                },
                style: { ...styles.input, flex: 1 },
              },
                h('option', { value: '' }, '选择提供商 / provider'),
                providers.map((p) => h('option', { key: p.id, value: p.id }, p.name || p.id)),
                m.provider && !providers.some((p) => p.id === m.provider)
                  ? h('option', { value: m.provider }, m.provider)
                  : null,
              ),
              h('select', {
                value: m.model,
                onChange: (e) => {
                  const next = draftModels.slice();
                  next[i] = { ...next[i], model: e.target.value };
                  setDraftModels(next);
                },
                style: { ...styles.input, flex: 1 },
              },
                h('option', { value: '' }, '选择模型 / model'),
                providerModels(m.provider).map((mm) =>
                  h('option', { key: mm.id, value: mm.id }, mm.name || mm.id),
                ),
                m.model && !providerModels(m.provider).some((mm) => mm.id === m.model)
                  ? h('option', { value: m.model }, m.model)
                  : null,
              ),
              i === 0
                ? null
                : h('button', {
                    type: 'button',
                    style: styles.btn,
                    'aria-label': '上移',
                    title: '上移',
                    onClick: () => moveDraft(i, -1),
                  }, '↑'),
              i === draftModels.length - 1
                ? null
                : h('button', {
                    type: 'button',
                    style: styles.btn,
                    'aria-label': '下移',
                    title: '下移',
                    onClick: () => moveDraft(i, 1),
                  }, '↓'),
              h('button', {
                type: 'button',
                style: styles.btn,
                onClick: () => {
                  const next = draftModels.filter((_, idx) => idx !== i);
                  setDraftModels(next.length ? next : [{ provider: '', model: '' }]);
                },
              }, '移除'),
            ),
          ),
          h('div', { style: { ...styles.row, marginTop: 8 } },
            h('button', {
              type: 'button',
              style: styles.btn,
              onClick: () => setDraftModels(draftModels.concat([{ provider: '', model: '' }])),
            }, '添加模型'),
            h('button', { type: 'button', style: styles.btnPrimary, onClick: saveRoute }, '保存'),
            editing
              ? h('button', { type: 'button', style: styles.btn, onClick: resetDraft }, '取消编辑')
              : null,
          ),
            )
            : null,
        ),

        // -------- model visibility --------
        h('div', { style: { ...styles.card, marginTop: 12 } },
          h('div', { style: { ...styles.row, justifyContent: 'space-between' } },
            h('div', { style: { fontWeight: 600 } }, '对外展示的模型 / Visible models'),
            h('div', { style: styles.row },
              h('button', { type: 'button', style: styles.btn, onClick: showAllModels }, '全部显示'),
              masked
                ? null
                : h('button', {
                    type: 'button',
                    style: styles.btnPrimary,
                    onClick: saveForwarding,
                    disabled: saving,
                  }, saving ? '保存中…' : '保存设置 / Save'),
            ),
          ),
          h('div', { style: { ...styles.muted, marginTop: 4, marginBottom: 8 } },
            '取消勾选的模型不会出现在外部拉取的模型列表里；路由组始终显示。'),
          providers.map((p) => {
            const models = Array.isArray(p.models) ? p.models : [];
            const v = visibility[p.id];
            const selectedCount = v === undefined ? models.length : v.length;
            const isOpen = !!expanded[p.id];
            return h('div', { key: p.id },
              h('div', {
                style: styles.providerHeader,
                onClick: () => setExpanded({ ...expanded, [p.id]: !isOpen }),
              },
                h('div', { style: { fontWeight: 500, fontSize: 13 } },
                  `${p.name || p.id}`,
                  h('span', { style: { ...styles.muted, marginLeft: 6 } },
                    `${selectedCount}/${models.length}`),
                ),
                h('span', { style: styles.muted }, isOpen ? '收起' : '展开'),
              ),
              isOpen
                ? h('div', null,
                    h('div', { style: { ...styles.row, marginTop: 6 } },
                      h('button', { type: 'button', style: styles.btn, onClick: () => selectAllProvider(p.id) }, '全选'),
                      h('button', { type: 'button', style: styles.btn, onClick: () => invertProvider(p.id) }, '反选'),
                      h('button', { type: 'button', style: styles.btn, onClick: () => clearProvider(p.id) }, '清空'),
                    ),
                    h('div', { style: styles.modelGrid },
                      models.map((m) =>
                        h('label', { key: m.id, style: styles.check },
                          h('input', {
                            type: 'checkbox',
                            checked: isChecked(p.id, m.id),
                            onChange: () => toggleModel(p.id, m.id),
                          }),
                          h('span', null, m.name || m.id),
                        ),
                      ),
                    ),
                  )
                : null,
            );
          }),
        ),

        // -------- self update --------
        masked
          ? null
          : h('div', { style: { ...styles.card, marginTop: 12 } },
              h('div', { style: { ...styles.row, justifyContent: 'space-between' } },
                h('div', { style: { fontWeight: 600 } }, '插件更新 / Plugin update'),
                h('div', { style: styles.row },
                  h('span', { style: styles.muted },
                    update && update.current ? `v${update.current}` : 'v?'),
                  h('button', {
                    type: 'button',
                    style: styles.btn,
                    onClick: checkUpdate,
                    disabled: checking || (update && (update.phase === 'removing' || update.phase === 'installing')),
                  }, checking ? '检查中…' : '检查更新'),
                  update && update.available
                    ? h('button', {
                        type: 'button',
                        style: styles.btnPrimary,
                        onClick: startUpgrade,
                      }, `升级到 v${update.latest}`)
                    : null,
                ),
              ),
              update && update.latest && !update.available && update.phase === 'idle'
                ? h('div', { style: { ...styles.muted, marginTop: 6 } },
                    update.error ? `检查失败：${update.error}` : `已是最新版本（v${update.current}）`)
                : null,
              update && (update.phase === 'removing' || update.phase === 'installing')
                ? h('div', { style: { ...styles.muted, marginTop: 6, color: '#b45309' } },
                    `${update.message || '升级中'}… 请勿刷新页面`)
                : null,
              update && (update.phase === 'done' || update.phase === 'restart-required' || update.phase === 'failed' || update.phase === 'interrupted')
                ? h('div', { style: { ...styles.muted, marginTop: 6, color: update.phase === 'failed' || update.phase === 'interrupted' ? '#dc2626' : '#059669' } },
                    update.phase === 'restart-required'
                      ? `${update.message || '升级完成'}；需重启 DSH 后新代码生效。`
                      : update.message || '')
                : null,
            ),

        // -------- bottom call hint (docs moved to top) --------

        h('div', { style: { ...styles.muted, marginTop: 10 } },
          `调用 / Call: POST ${phoneBase}/chat/completions，model 填路由组 ID 或 provider:model。`),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Settings -> Plugins -> Plugin settings, plus the plugins page seats.
        // `key` for settings.plugin.item MUST equal the settings namespace (row id).
        for (const [slotName, key] of [
          ['plugins.bundle.config', PKG],
          ['plugins.row.config', ROW_CONFIG_KEY],
          ['settings.plugin.item', NS],
        ]) {
          try {
            ctx.slots.inject(slotName, () =>
              ctx.slots.register(
                { name: slotName, key, locale: NS, inject: () => ({ ctx }) },
                ModelRouterGatewayCard,
              ),
            );
          } catch (e) {
            /* seat unavailable in this build; try the next one */
          }
        }
      },
    };
  },
});
