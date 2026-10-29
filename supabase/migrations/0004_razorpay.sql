-- Run AFTER 0003. Makes billing columns provider-neutral for Razorpay.
alter table public.business_billing rename column stripe_customer_id to provider_customer_id;
alter table public.business_billing rename column stripe_subscription_id to provider_subscription_id;
alter table public.business_billing add column if not exists provider text not null default 'razorpay';
