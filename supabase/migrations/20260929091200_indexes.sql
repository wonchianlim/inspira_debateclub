-- =============================================================================
-- 20260929091200_indexes.sql
--
-- 索引（第 6.8 节 + 外键）。
--
-- 注意：PostgreSQL **不会**为外键自动建立索引。缺少外键索引会导致
-- 父表的删除/更新变慢，以及常见的连接查询全表扫描。
-- 因此下面既包含第 6.8 节点名的查询索引，也包含 Phase 1 各外键列的索引。
--
-- 已被 UNIQUE 约束覆盖的前缀列不再重复建立索引（例如 user_roles 的
-- (profile_id, role) 唯一约束已覆盖按 profile_id 的查找）。
-- =============================================================================

-- 活动列表与看板的核心访问路径（第 6.8 节明确要求）
create index events_status_starts_at_idx on public.events (status, starts_at);
create index events_created_by_idx on public.events (created_by);

-- 报名：按活动 + 状态筛选（第 6.8 节），以及按学生查历史
create index registrations_event_status_idx on public.registrations (event_id, status);
create index registrations_student_id_idx on public.registrations (student_id);

-- 角色：按操作者查授予记录
create index user_roles_created_by_idx on public.user_roles (created_by);

-- 按赛制查资格（前缀列已由唯一约束覆盖，此处只需 format_id）
create index student_format_profiles_format_id_idx on public.student_format_profiles (format_id);
create index student_format_profiles_updated_by_idx on public.student_format_profiles (updated_by);

create index judge_format_qualifications_format_id_idx
  on public.judge_format_qualifications (format_id);
create index judge_format_qualifications_approved_by_idx
  on public.judge_format_qualifications (approved_by);

-- 活动启用的赛制：按赛制反查活动
create index event_formats_format_id_idx on public.event_formats (format_id);

-- 报名偏好：按赛制反查
create index registration_format_preferences_format_id_idx
  on public.registration_format_preferences (format_id);

-- 审计：第 6.8 节要求的"按实体查该实体的历史，最新的在前"
create index audit_logs_entity_created_at_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_profile_id_idx on public.audit_logs (actor_profile_id);

-- 系统设置：按修改者反查
create index system_settings_updated_by_idx on public.system_settings (updated_by);
