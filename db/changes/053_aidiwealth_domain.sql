-- 053_aidiwealth_domain.sql — blog articles point to aidiwealth.com instead of joinaidi.com.
BEGIN;
UPDATE content.posts SET
  title = regexp_replace(regexp_replace(title, 'https?://(www\.)?joinaidi\.com', 'https://aidiwealth.com', 'gi'), '(www\.)?joinaidi\.com', 'aidiwealth.com', 'gi'),
  description = regexp_replace(regexp_replace(description, 'https?://(www\.)?joinaidi\.com', 'https://aidiwealth.com', 'gi'), '(www\.)?joinaidi\.com', 'aidiwealth.com', 'gi'),
  body = regexp_replace(regexp_replace(body, 'https?://(www\.)?joinaidi\.com', 'https://aidiwealth.com', 'gi'), '(www\.)?joinaidi\.com', 'aidiwealth.com', 'gi'),
  seo_description = regexp_replace(coalesce(seo_description, ''), '(www\.)?joinaidi\.com', 'aidiwealth.com', 'gi'),
  source = CASE WHEN source ILIKE '%joinaidi%' THEN 'aidiwealth.com' ELSE source END, updated_at = now()
WHERE concat_ws(' ', title, description, body, seo_description, source) ILIKE '%joinaidi%';
COMMIT;
