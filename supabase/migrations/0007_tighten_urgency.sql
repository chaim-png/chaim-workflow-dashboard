-- Run once the app that writes low / medium / urgent is deployed.
select set_config('app.actor', 'Dashboard upgrade', true);
update public.tasks set priority = case priority when 'high' then 'urgent' else 'medium' end where priority in ('high', 'normal');
alter table public.tasks drop constraint tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check check (priority in ('low', 'medium', 'urgent'));
