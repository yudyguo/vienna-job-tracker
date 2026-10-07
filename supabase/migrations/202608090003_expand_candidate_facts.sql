insert into public.candidate_facts (id, category, label, value, evidence, verified, source) values
('fact-wocute-role','experience','Product Designer · MQJC Technology · Wocute Project','2023 to 2025','Led research and product design for a women''s health product, including privacy, Arabic and right-to-left interfaces.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf'),
('fact-tencent-role','experience','Interaction Designer · Tencent · WeChat Project','2021 to 2023','Translated merchant, service-team and business needs into flows, reusable patterns and detailed engineering requirements.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf'),
('fact-alipay-role','experience','User Experience Designer Intern · Alipay · Insurance','2020','Interviewed internal users and redesigned merchant workflows; supported QA, launch and later improvements.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf'),
('fact-tools','skill','Design and research tools','Figma, Sketch, Hotjar, Adobe Creative Suite','Skills sections across the source CVs.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf; yadi_cv.pdf'),
('fact-education-ms','education','M.S. Human-Computer Interaction','Sun Yat-Sen University · 2021','Education section.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf'),
('fact-education-ba','education','B.A. Internet and New Media','Sun Yat-Sen University · 2019','Education section.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf'),
('fact-recognition','award','Recognition','Red Dot Design Concept Finalist · 2020; iGEM Gold · Best Software · Best Applied Design Nominee · 2017','Recognition section.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf'),
('fact-work-authorization','experience','Austria work authorization','Eligible to work in Austria without sponsorship','Profile statement.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf'),
('fact-languages-fluent','language','Languages','English, Chinese and Cantonese · Fluent','Languages section.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf')
on conflict (id) do update set category = excluded.category, label = excluded.label, value = excluded.value, evidence = excluded.evidence, verified = excluded.verified, source = excluded.source;
