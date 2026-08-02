-- Swaps the hardcoded "2 minutes" claim in the NO_MATCH guidance for a
-- {{expiry}} placeholder, substituted at request time in the verify-code
-- route with the actual matched customer's company's configured expiry.
update error_messages
set guidance_html = '<p>That code and mobile number don''t match, or the code has expired. Codes are valid for {{expiry}} -- ask staff for a new one.</p>'
where company_id = '00000000-0000-0000-0000-000000000000'
  and error_code = 'NO_MATCH';
