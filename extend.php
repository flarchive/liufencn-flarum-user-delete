<?php

/**
 * 后台「删除用户」入口（liufencn/flarum-user-delete）
 *
 * 背景：Flarum 2.0 核心的「编辑用户」弹窗（common/components/EditUserModal）没有删除按钮，
 * 但后端能力齐全：
 *   · UserResource 注册了 Endpoint\Delete（DELETE /api/users/{id}，->can('delete')）
 *   · UserResource 序列化 canDelete 字段
 *   · UserPolicy::can('delete') → hasPermission('user.delete')，而 User::hasPermission()
 *     对管理员（isAdmin）直接 return true → 管理员始终有删除权
 *   · User 模型 boot 里对 root admin（id=1）硬拒（DomainException）
 * 本扩展只做前端：在 EditUserModal.fields() 注入一个两步确认的删除按钮。
 * 纯 JS 扩展，无 PHP 类 → 不声明 autoload。
 */

use Flarum\Extend;

return [
    // ─── 语言包（resources/locale 由 Flarum 的 Locales extender 注册） ───
    new Extend\Locales(__DIR__ . '/resources/locale'),

    // ─── 后台前端资源（手写 dist，不依赖 webpack 构建） ───
    (new Extend\Frontend('admin'))->js(__DIR__ . '/js/dist/admin.js'),
];
