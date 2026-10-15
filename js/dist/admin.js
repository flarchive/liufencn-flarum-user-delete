/**
 * 后台「删除用户」按钮（liufencn/flarum-user-delete）—— 手写 admin dist，不依赖 webpack。
 *
 * 作用：在后台「用户」页的「编辑用户」弹窗底部注入一个删除按钮
 *   （Flarum 2.0 核心 EditUserModal 没有删除按钮，但 DELETE /api/users/{id} 后端可用）。
 *
 * 交互：两步确认 —— 第一次点击进入「确认删除？此操作不可撤销」 armed 态（5 秒自动收起），
 *   第二次点击才真正发 DELETE；请求期间按钮 loading；失败走 FormModal.onerror 标准错误展示；
 *   成功后 store.remove + 关闭弹窗 + 整页重载（用户列表是分页快照，重载最稳）。
 *
 * 可见性规则（后端仍有最终把关）：
 *   · root admin（id=1）不显示 —— User 模型 boot 里 DomainException 硬拒，显示了也删不掉
 *   · 不删自己（uid === session.user.id()）
 *   · 尊重序列化的 canDelete（为 false 时不显示；管理员经 User::hasPermission() 的 isAdmin 豁免恒为 true）
 *
 * ★ Flarum 2.0 前端扩展 API 要点（本文件据此实现，勿想当然）：
 *   1) dist 末尾必须有 `module.exports = { extend: [] }`：JsCompiler 把扩展 dist 直接拼进
 *      admin.js 并追加 `flarum.extensions['<id>'] = module.exports`；不定义会污染核心模块
 *      注册表 → 整站 JS 启动中断（reply-pin 的血泪坑）。
 *   2) override() 的字符串路径必须带 `flarum/` 前缀：
 *      'flarum/common/components/EditUserModal' → namespaceAndIdFromPath 解析出
 *      namespace='core' + id='common/components/EditUserModal'（与 admin.js 里
 *      flarum.reg.addChunkModule(...) 注册的一致）；不带前缀正则不匹配 → 抛 reading '4'。
 *   3) override 的 newMethod 第一个参数是 original（已 bind），真参数从第二个起；
 *      fields() 无参，直接 original.call(this)。
 *   4) override 必须在 app.initializers.add() 回调内调用：extend.ts 读
 *      app.currentInitializerExtension 做错误归属，initializer 外为 null。
 *   5) EditUserModal 是懒加载 chunk 模块，reg.onLoad 会在 chunk 就绪后自动打补丁，
 *      无需自己 import()/轮询。
 *   6) mithril 用 window.m（forum/admin 两个 bundle 都暴露）；组件用 m(Component, attrs, children)。
 */
(() => {
  const reg = window.flarum && window.flarum.reg;
  if (!reg) return;

  const unwrap = (mod) => (mod && mod.__esModule ? mod.default : mod);
  const m = window.m;

  const app = unwrap(reg.get('core', 'admin/app')) || window.app;
  const extendMod = reg.get('core', 'common/extend');
  const override = (unwrap(extendMod) || extendMod || {}).override;
  const Button = unwrap(reg.get('core', 'common/components/Button'));

  const debug = {
    hasReg: !!reg,
    hasApp: !!app,
    hasM: typeof m === 'function',
    hasOverride: typeof override === 'function',
    hasButton: !!Button,
  };
  try {
    window.__USER_DELETE_DEBUG__ = debug;
  } catch (e) {
    /* ignore */
  }

  if (!app || typeof m !== 'function' || typeof override !== 'function' || !Button) return;

  const t = (key, fallback) => {
    try {
      const v = app.translator.trans(key);
      if (typeof v === 'string' && v) return v;
      return fallback;
    } catch (e) {
      return fallback;
    }
  };

  const CONFIRM_TIMEOUT = 5000;

  app.initializers.add('cathi-user-delete', () => {
    override('flarum/common/components/EditUserModal', 'fields', function (original) {
      const items = original.call(this);

      let user;
      try {
        user = this.attrs && this.attrs.user;
      } catch (e) {
        return items;
      }
      if (!user) return items;

      const uid = user.id();
      // root admin：后端 User::boot 的 deleting 事件 DomainException 硬拒，不显示
      if (uid === 1) return items;
      // 不删自己
      const self = app.session && app.session.user;
      if (self && uid === self.id()) return items;
      // 尊重后端序列化的 canDelete（缺字段时默认显示，由后端最终把关）
      let canDelete = true;
      try {
        if (typeof user.canDelete === 'function' && user.canDelete() === false) canDelete = false;
      } catch (e) {
        /* ignore */
      }
      if (!canDelete) return items;

      if (this.cathiConfirmDelete === undefined) this.cathiConfirmDelete = false;

      const modal = this;

      items.add(
        'cathiDeleteUser',
        m(
          Button,
          {
            className: 'Button Button--danger',
            disabled: !!modal.cathiDeleteLoading,
            loading: !!modal.cathiDeleteLoading,
            onclick: () => {
              if (!modal.cathiConfirmDelete) {
                // 第一步：进入 armed 态，5 秒无二次点击自动收起
                modal.cathiConfirmDelete = true;
                clearTimeout(modal._cathiConfirmTimer);
                modal._cathiConfirmTimer = setTimeout(() => {
                  modal.cathiConfirmDelete = false;
                  m.redraw();
                }, CONFIRM_TIMEOUT);
                m.redraw();
                return;
              }
              // 第二步：真正删除
              clearTimeout(modal._cathiConfirmTimer);
              modal.cathiDeleteLoading = true;
              m.redraw();
              app
                .request({ method: 'DELETE', url: '/api/users/' + uid })
                .then(() => {
                  try {
                    app.store.remove(user);
                  } catch (e) {
                    /* ignore */
                  }
                  modal.cathiConfirmDelete = false;
                  modal.cathiDeleteLoading = false;
                  app.modal.close();
                  // 用户列表是分页快照：删除后整页重载，避免残留行 / 计数不准
                  setTimeout(() => window.location.reload(), 150);
                })
                .catch((err) => {
                  modal.cathiDeleteLoading = false;
                  modal.cathiConfirmDelete = false;
                  m.redraw();
                  try {
                    modal.onerror(err);
                  } catch (e) {
                    /* ignore */
                  }
                });
            },
          },
          modal.cathiConfirmDelete
            ? t('liufencn-user-delete.admin.confirm_button', '确认删除？此操作不可撤销')
            : t('liufencn-user-delete.admin.delete_button', '删除用户')
        ),
        -20
      );

      return items;
    });
  });

  // ★ 守卫：缺失会污染核心模块注册表，中断整站 JS（见文件头注释第 1 条）
  module.exports = { extend: [] };
})();
