-- A6: the AI disease advisory (SRDS §32-§37, decision D11).
--
--   * `disease_knowledge` is the reviewed advisory text per model class, so the report reads symptoms, treatment and
--     precautions from the database instead of a dict in backend code (SRDS §34-§35).
--   * a disease case records its own processing state (`pending` → `predicted` | `failed`), written only by the backend.
--   * D11: only farmers create disease cases.
--   * a consultation may carry the disease case it is about; the assigned expert then reads that case and its
--     prediction, and answers with an assessment (agree, correct, add a diagnosis, ask for information). BR-13: the AI
--     result is advisory and routes to an expert; the assessment is that route's answer.
--
-- IMPORTANT (plan A6, outside dependency): every `disease_knowledge` row below is DRAFT text derived from the advisory
-- copy that shipped in backend/app/ai/service.py. A qualified agronomist must review every entry, and the admin mark it
-- `reviewed`, before release. Until then every row is `pending_review`, and the app must say the advice is unreviewed.

-- ---------------------------------------------------------------------------------------------------------------------
-- disease_knowledge: one row per model class (backend/app/ai/checkpoints/class_names.json, all 38 labels)
-- ---------------------------------------------------------------------------------------------------------------------

create table public.disease_knowledge (
  -- The raw model label, exactly as the model emits it, so the lookup needs no mapping.
  class_label text primary key,
  crop text not null check (length(trim(crop)) > 0),
  disease text not null check (length(trim(disease)) > 0),
  is_healthy boolean not null default false,
  symptoms text[] not null default '{}',
  treatment text[] not null default '{}',
  precautions text[] not null default '{}',
  advisory text not null check (length(trim(advisory)) > 0),
  review_status text not null default 'pending_review' check (review_status in ('pending_review', 'reviewed')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index disease_knowledge_reviewed_by_idx on public.disease_knowledge (reviewed_by);

create trigger set_disease_knowledge_updated_at before update on public.disease_knowledge
  for each row execute function public.set_updated_at();

alter table public.disease_knowledge enable row level security;

-- Reference content, not private: any signed-in user may read it (the report is shown to the farmer and the expert).
-- Anon gets nothing; the advisory is part of a signed-in flow.
create policy "disease_knowledge_select_authenticated" on public.disease_knowledge for select
  to authenticated
  using (true);

-- Only an admin with a second factor edits it (the same aal2 rule as every other admin write, 20260924080100).
-- Edit only, never add or remove: the 38 classes are fixed by the model (class_names.json) and seeded below. A removed
-- class would silently fall back to generic advice, and an added one could never be predicted. So `authenticated` holds
-- no insert or delete grant and there is no insert or delete policy; a model change brings its classes in a migration.
create policy "disease_knowledge_admin_update" on public.disease_knowledge for update
  to authenticated
  using ((select public.is_admin_aal2()))
  with check ((select public.is_admin_aal2()));

grant select, update on public.disease_knowledge to authenticated;
grant select on public.disease_knowledge to service_role;

-- The review rule lives in the table, not only in the backend (admin/service.py update_disease_knowledge), so a direct
-- PostgREST write by an aal2 admin obeys it too:
--   * text that is edited is no longer the text that was reviewed, so it goes back to `pending_review` and loses its
--     reviewer, unless the same statement is the one that signs it off (pending_review -> reviewed);
--   * the reviewer is always the caller (auth.uid()) at the moment the row becomes `reviewed`, whatever reviewed_by or
--     reviewed_at the client sent: nobody can record a review in someone else's name;
--   * otherwise reviewed_by and reviewed_at cannot be changed by a client. The one change let through is clearing
--     reviewed_by to null while the row stays reviewed: that is the `on delete set null` of the reviewer's profile,
--     which runs as an update and fires this trigger.
-- Invoker rights: it only rewrites NEW, and search_path = '' so every name is schema-qualified. As postgres or the
-- service role auth.uid() is null, so a review made outside a user session records no reviewer.
create function public.guard_disease_knowledge_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  text_changed boolean := (new.crop, new.disease, new.is_healthy, new.symptoms, new.treatment, new.precautions, new.advisory)
    is distinct from (old.crop, old.disease, old.is_healthy, old.symptoms, old.treatment, old.precautions, old.advisory);
begin
  if new.review_status = 'reviewed' and old.review_status = 'reviewed' and text_changed then
    -- Edited reviewed text, even if the client sent review_status = 'reviewed' again: back to the queue.
    new.review_status := 'pending_review';
  end if;

  if new.review_status = 'pending_review' then
    new.reviewed_by := null;
    new.reviewed_at := null;
  elsif old.review_status is distinct from 'reviewed' then
    -- Becomes reviewed in this statement: the caller is the reviewer, now.
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  else
    -- Stays reviewed with the same text: the recorded review is fixed (only a null reviewed_by passes, see above).
    if new.reviewed_by is not null then
      new.reviewed_by := old.reviewed_by;
    end if;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_disease_knowledge_review() from public, anon, authenticated;

-- `a_` so it runs before set_disease_knowledge_updated_at (BEFORE triggers fire in name order); either order works, the
-- prefix only keeps it with the other guards (a_guard_consultations_update, a_guard_consultations_insert).
create trigger a_guard_disease_knowledge_review
  before update on public.disease_knowledge
  for each row execute function public.guard_disease_knowledge_review();

-- BR-15 / SRDS §51: every admin change to the advisory text is audited as "AI Configuration Changed", in the same
-- transaction as the change, so a failed audit write rolls the change back (the backend writing it as a second step
-- could leave an unaudited edit; same pattern as audit_required_documents, 20261012080000). SECURITY DEFINER because
-- audit_logs' insert policy is is_admin() and the trigger must not depend on the caller's own insert path; it only
-- ever writes this one row. target_id is a uuid and the key is the text class_label, so the class goes in metadata.
-- previous_state / new_state hold only the columns that changed (updated_at is bookkeeping, left out).
-- Insert and delete are audited too, as defence in depth: no client can do either (no grant, no policy), but a
-- service-role or postgres write must still leave a trace (BR-15). For those, previous_state (insert) or new_state
-- (delete) is null and the other holds the whole row; metadata.change is 'insert' or 'delete'. An update keeps its finer
-- 'review' / 'edit' (the backend's smoke test test_smoke_admin_audit.py reads those). The trigger is created after the
-- seed below, so the 38 seeded rows write no audit rows.
create or replace function public.audit_disease_knowledge()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'updated_at' end;
  after_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'updated_at' end;
  -- Read before the update branch trims both rows to the changed columns (the key never changes, so it is trimmed).
  v_label text := coalesce(after_row, before_row) ->> 'class_label';
  changed text[];
  v_change text;
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(o.key), '{}') into changed
      from jsonb_each(before_row) o
     where o.value is distinct from after_row -> o.key;
    before_row := before_row - (select coalesce(array_agg(k), '{}') from jsonb_object_keys(before_row) k where k <> all (changed));
    after_row := after_row - (select coalesce(array_agg(k), '{}') from jsonb_object_keys(after_row) k where k <> all (changed));
    v_change := case when new.review_status = 'reviewed' and old.review_status is distinct from 'reviewed'
                     then 'review' else 'edit' end;
  else
    v_change := lower(tg_op);
  end if;

  insert into public.audit_logs (actor_id, action, target_entity, target_id, previous_state, new_state, metadata)
  values (
    (select auth.uid()),
    'ai_configuration_changed',
    'disease_knowledge',
    null,
    before_row,
    after_row,
    jsonb_build_object('class_label', v_label, 'change', v_change)
  );
  return null;
end;
$$;

revoke execute on function public.audit_disease_knowledge() from public, anon, authenticated;

insert into public.disease_knowledge (class_label, crop, disease, is_healthy, symptoms, treatment, precautions, advisory)
values
  ('Apple___Apple_scab', 'Apple', 'Apple scab', false,
   array['Olive-green to dark, velvety spots on leaves', 'Dark, scab-like, corky lesions on fruit', 'Early leaf yellowing and drop in wet springs'],
   array['Rake up and destroy fallen leaves to reduce next season''s spore load', 'Prune to open the canopy and improve air circulation', 'Ask an agricultural expert about a protective fungicide programme from bud break'],
   array['Avoid overhead irrigation that keeps foliage wet', 'Prefer scab-resistant varieties for new plantings'],
   'The leaf pattern may indicate apple scab, a fungal disease that spreads readily in cool, wet spring weather. Consult an agricultural expert to confirm the diagnosis before treating.'),
  ('Apple___Black_rot', 'Apple', 'Black rot', false,
   array['Purple-bordered round leaf spots ("frog-eye" spots)', 'Firm brown-to-black rot on fruit, often from the blossom end', 'Sunken cankers on branches'],
   array['Prune out and destroy dead or cankered wood', 'Remove mummified fruit from the tree and the ground', 'Ask an agricultural expert about fungicide options'],
   array['Keep the orchard free of prunings and fruit debris', 'Avoid wounding bark during cultivation'],
   'The leaf pattern may indicate black rot, a fungal disease of leaves, fruit and branches. Consult an agricultural expert to confirm the diagnosis before treating.'),
  ('Apple___Cedar_apple_rust', 'Apple', 'Cedar apple rust', false,
   array['Bright orange-yellow spots on the upper leaf surface', 'Small tube-like structures under the leaf spots', 'Premature leaf drop in heavy infections'],
   array['Remove and destroy affected leaves to limit spread', 'Where practical, remove nearby juniper or cedar hosts', 'Ask an agricultural expert about fungicide timing around bloom'],
   array['Plant rust-resistant varieties', 'Avoid planting apples near junipers'],
   'The leaf pattern may indicate cedar apple rust, a fungal disease that needs a nearby juniper or cedar host to complete its life cycle. Consult an agricultural expert to confirm the diagnosis.'),
  ('Apple___healthy', 'Apple', 'Healthy', true,
   array['No signs of disease detected'],
   array['No treatment needed'],
   array['Continue routine monitoring', 'Maintain good spacing and airflow between trees', 'Clear fallen leaves and fruit each season'],
   'No signs of disease were detected on this apple leaf. Keep monitoring the orchard regularly.'),
  ('Blueberry___healthy', 'Blueberry', 'Healthy', true,
   array['No signs of disease detected'],
   array['No treatment needed'],
   array['Continue routine monitoring', 'Maintain consistent soil moisture and good drainage', 'Prune old canes to keep the bush open'],
   'No signs of disease were detected on this blueberry leaf. Keep monitoring the plants regularly.'),
  ('Cherry_(including_sour)___Powdery_mildew', 'Cherry (including sour)', 'Powdery mildew', false,
   array['White, powdery growth on young leaves', 'Curled or distorted new leaves', 'Powdery patches on fruit in severe cases'],
   array['Prune to improve air circulation around affected branches', 'Remove badly affected shoots', 'Ask an agricultural expert about fungicide options'],
   array['Avoid excess nitrogen fertiliser, which encourages susceptible new growth', 'Keep the canopy open and well ventilated'],
   'The leaf pattern may indicate powdery mildew, a fungal disease that thrives in warm, humid conditions with poor air circulation. Consult an agricultural expert to confirm the diagnosis.'),
  ('Cherry_(including_sour)___healthy', 'Cherry (including sour)', 'Healthy', true,
   array['No signs of disease detected'],
   array['No treatment needed'],
   array['Continue routine monitoring', 'Maintain good spacing and airflow between trees'],
   'No signs of disease were detected on this cherry leaf. Keep monitoring the orchard regularly.'),
  ('Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot', 'Corn (maize)', 'Cercospora leaf spot (gray leaf spot)', false,
   array['Narrow, rectangular gray-to-tan lesions between the leaf veins', 'Lesions merge and kill large leaf areas', 'Lower leaves affected first'],
   array['Ask an agricultural expert about fungicide timing if lesions reach the upper leaves before grain fill', 'Remove or bury infected crop residue after harvest'],
   array['Rotate away from maize for a season if the field has a history of the disease', 'Choose a more resistant hybrid for future plantings'],
   'The leaf pattern may indicate gray leaf spot, a fungal disease that spreads fastest in humid, poorly ventilated fields. Consult an agricultural expert to confirm the diagnosis.'),
  ('Corn_(maize)___Common_rust_', 'Corn (maize)', 'Common rust', false,
   array['Small, reddish-brown powdery pustules on both leaf surfaces', 'Pustules scattered across the leaf', 'Leaves yellow in heavy infections'],
   array['Monitor closely: most modern hybrids tolerate common rust without treatment', 'Ask an agricultural expert if pustules are dense or the crop is young and stressed'],
   array['Choose rust-tolerant hybrids', 'Avoid late planting where rust is common'],
   'The leaf pattern may indicate common rust, a fungal disease that often needs no treatment on tolerant hybrids. Consult an agricultural expert if the infection is heavy.'),
  ('Corn_(maize)___Northern_Leaf_Blight', 'Corn (maize)', 'Northern leaf blight', false,
   array['Long, cigar-shaped gray-green to tan lesions', 'Lesions start on lower leaves and move upward', 'Large areas of dead leaf in humid weather'],
   array['Ask an agricultural expert about fungicide options if the disease appears before tasseling', 'Remove or bury infected crop residue after harvest'],
   array['Choose a more resistant hybrid for future plantings', 'Rotate away from maize for a season if the field has a history of the disease'],
   'The leaf pattern may indicate northern leaf blight, a fungal disease that can spread quickly in humid weather. Consult an agricultural expert to confirm the diagnosis.'),
  ('Corn_(maize)___healthy', 'Corn (maize)', 'Healthy', true,
   array['No signs of disease detected'],
   array['No treatment needed'],
   array['Continue routine monitoring', 'Maintain balanced fertilisation and field drainage'],
   'No signs of disease were detected on this maize leaf. Keep monitoring the field regularly.'),
  ('Grape___Black_rot', 'Grape', 'Black rot', false,
   array['Reddish-brown circular leaf spots with dark borders', 'Berries shrivel into hard, black mummies', 'Dark lesions on shoots and tendrils'],
   array['Remove mummified fruit and infected leaf debris, where the fungus overwinters', 'Ask an agricultural expert about fungicide timing from early shoot growth'],
   array['Improve air circulation through canopy management', 'Keep the vineyard floor clean of infected debris'],
   'The leaf pattern may indicate black rot, a fungal disease that can destroy grape bunches. Consult an agricultural expert to confirm the diagnosis.'),
  ('Grape___Esca_(Black_Measles)', 'Grape', 'Esca (black measles)', false,
   array['"Tiger-stripe" yellow or red discoloration between leaf veins', 'Dark spots on berries', 'Sudden wilting of a vine in hot weather'],
   array['Ask an agricultural expert for a vine-by-vine assessment: trunk diseases need individual management', 'Remove and destroy dead wood and badly affected vines'],
   array['Avoid large pruning wounds during wet weather', 'Disinfect pruning tools between vines'],
   'The leaf pattern may indicate esca (black measles), a fungal trunk disease that can affect vines for years. Consult an agricultural expert to confirm the diagnosis.'),
  ('Grape___Leaf_blight_(Isariopsis_Leaf_Spot)', 'Grape', 'Leaf blight (Isariopsis leaf spot)', false,
   array['Angular dark-brown spots on leaves', 'Spots merge into large dead patches', 'Early leaf drop'],
   array['Remove and destroy heavily affected leaves', 'Ask an agricultural expert about fungicide options'],
   array['Improve air circulation through canopy management', 'Clear fallen leaves after the season'],
   'The leaf pattern may indicate Isariopsis leaf blight, a fungal disease that can cause early leaf drop. Consult an agricultural expert to confirm the diagnosis.'),
  ('Grape___healthy', 'Grape', 'Healthy', true,
   array['No signs of disease detected'],
   array['No treatment needed'],
   array['Continue routine monitoring', 'Maintain good canopy airflow'],
   'No signs of disease were detected on this grape leaf. Keep monitoring the vineyard regularly.'),
  ('Orange___Haunglongbing_(Citrus_greening)', 'Orange', 'Huanglongbing (citrus greening)', false,
   array['Blotchy, uneven yellowing of leaves (not symmetric across the midrib)', 'Small, lopsided, bitter fruit that stays green', 'Twig dieback and declining tree'],
   array['Contact an agricultural expert urgently: there is no cure, and early management (including possible tree removal) protects nearby trees', 'Control the psyllid insects that spread the disease, on the expert''s advice'],
   array['Isolate and closely monitor the affected tree', 'Buy only certified disease-free nursery plants'],
   'The leaf pattern may indicate citrus greening (Huanglongbing), a serious bacterial disease spread by psyllid insects that can kill the tree. Consult an agricultural expert urgently.'),
  ('Peach___Bacterial_spot', 'Peach', 'Bacterial spot', false,
   array['Small, dark, angular leaf spots', 'Spots drop out, leaving a "shot-hole" look', 'Sunken spots and cracks on fruit'],
   array['Ask an agricultural expert about copper-based or other bactericide options', 'Remove badly affected twigs during dry weather'],
   array['Avoid overhead irrigation and working around wet trees, which spreads bacteria', 'Prefer resistant varieties for new plantings'],
   'The leaf pattern may indicate bacterial spot, which affects peach leaves and fruit. Consult an agricultural expert to confirm the diagnosis.'),
  ('Peach___healthy', 'Peach', 'Healthy', true,
   array['No signs of disease detected'],
   array['No treatment needed'],
   array['Continue routine monitoring', 'Maintain good spacing and airflow between trees'],
   'No signs of disease were detected on this peach leaf. Keep monitoring the orchard regularly.'),
  ('Pepper,_bell___Bacterial_spot', 'Pepper (bell)', 'Bacterial spot', false,
   array['Small, water-soaked leaf spots that turn dark', 'Yellowing and leaf drop', 'Raised, scabby spots on fruit'],
   array['Remove and destroy heavily affected plants to limit spread', 'Ask an agricultural expert about copper-based treatment options'],
   array['Avoid overhead watering and handling plants while foliage is wet', 'Use certified disease-free seed and rotate crops'],
   'The leaf pattern may indicate bacterial spot, which spreads readily in warm, wet conditions. Consult an agricultural expert to confirm the diagnosis.'),
  ('Pepper,_bell___healthy', 'Pepper (bell)', 'Healthy', true,
   array['No signs of disease detected'],
   array['No treatment needed'],
   array['Continue routine monitoring', 'Water consistently at the base of the plant'],
   'No signs of disease were detected on this bell pepper leaf. Keep monitoring the plants regularly.'),
  ('Potato___Early_blight', 'Potato', 'Early blight', false,
   array['Dark spots with target-like concentric rings', 'Older, lower leaves affected first', 'Yellowing around the spots'],
   array['Remove and destroy affected lower leaves to slow upward spread', 'Ask an agricultural expert about fungicide options'],
   array['Ensure adequate plant spacing for airflow', 'Rotate potatoes with non-host crops', 'Keep plants well fed: stressed plants are more susceptible'],
   'The leaf pattern may indicate early blight, a fungal disease common in warm, humid conditions. Consult an agricultural expert to confirm the diagnosis.'),
  ('Potato___Late_blight', 'Potato', 'Late blight', false,
   array['Large, dark, water-soaked patches on leaves', 'White fungal growth on leaf undersides in humid weather', 'Rapid collapse of foliage and rotting tubers'],
   array['Remove and destroy visibly affected foliage immediately', 'Contact an agricultural expert urgently about fungicide treatment'],
   array['Avoid overhead watering; water at the base of the plant', 'Plant certified disease-free seed tubers', 'Destroy volunteer potato plants and cull piles'],
   'The leaf pattern may indicate late blight, an aggressive disease that spreads quickly in cool, wet conditions and can destroy a crop within days. Consult an agricultural expert urgently.'),
  ('Potato___healthy', 'Potato', 'Healthy', true,
   array['No signs of disease detected'],
   array['No treatment needed'],
   array['Continue routine monitoring', 'Maintain consistent watering and good field drainage'],
   'No signs of disease were detected on this potato leaf. Keep monitoring the field regularly.'),
  ('Raspberry___healthy', 'Raspberry', 'Healthy', true,
   array['No signs of disease detected'],
   array['No treatment needed'],
   array['Continue routine monitoring', 'Maintain good airflow between canes', 'Remove old fruiting canes after harvest'],
   'No signs of disease were detected on this raspberry leaf. Keep monitoring the plants regularly.'),
  ('Soybean___healthy', 'Soybean', 'Healthy', true,
   array['No signs of disease detected'],
   array['No treatment needed'],
   array['Continue routine monitoring', 'Maintain balanced fertilisation and field drainage'],
   'No signs of disease were detected on this soybean leaf. Keep monitoring the field regularly.'),
  ('Squash___Powdery_mildew', 'Squash', 'Powdery mildew', false,
   array['White, powdery patches on upper leaf surfaces', 'Leaves yellow and dry out', 'Reduced fruit size and quality'],
   array['Remove badly affected leaves', 'Ask an agricultural expert about fungicide options'],
   array['Space plants and prune dense growth to improve air circulation', 'Avoid overhead watering late in the day'],
   'The leaf pattern may indicate powdery mildew, a fungal disease that thrives in warm, humid conditions with poor air circulation. Consult an agricultural expert to confirm the diagnosis.'),
  ('Strawberry___Leaf_scorch', 'Strawberry', 'Leaf scorch', false,
   array['Small purple spots on the upper leaf surface', 'Spots merge into scorched-looking blotches', 'Leaf edges dry and curl'],
   array['Remove and destroy old or heavily affected leaves after harvest', 'Ask an agricultural expert about treatment options'],
   array['Ensure adequate plant spacing for airflow', 'Renew plantings every few years'],
   'The leaf pattern may indicate leaf scorch, a fungal disease of strawberry leaves. Consult an agricultural expert to confirm the diagnosis.'),
  ('Strawberry___healthy', 'Strawberry', 'Healthy', true,
   array['No signs of disease detected'],
   array['No treatment needed'],
   array['Continue routine monitoring', 'Maintain good airflow and avoid overcrowding plants'],
   'No signs of disease were detected on this strawberry leaf. Keep monitoring the plants regularly.'),
  ('Tomato___Bacterial_spot', 'Tomato', 'Bacterial spot', false,
   array['Small, water-soaked leaf spots that turn dark', 'Yellowing and leaf drop', 'Raised, scabby spots on fruit'],
   array['Remove and destroy heavily affected plants to limit spread', 'Ask an agricultural expert about copper-based treatment options'],
   array['Avoid overhead watering and handling plants while foliage is wet', 'Use certified disease-free seed and rotate crops'],
   'The leaf pattern may indicate bacterial spot, which spreads readily in warm, wet conditions. Consult an agricultural expert to confirm the diagnosis.'),
  ('Tomato___Early_blight', 'Tomato', 'Early blight', false,
   array['Dark spots with target-like concentric rings', 'Older, lower leaves affected first', 'Yellowing around the spots and leaf drop'],
   array['Remove and destroy affected lower leaves to slow upward spread', 'Ask an agricultural expert about fungicide options'],
   array['Ensure adequate plant spacing for airflow', 'Mulch to stop soil splashing onto leaves', 'Rotate tomatoes with non-host crops'],
   'The leaf pattern may indicate early blight, a fungal disease common in warm, humid conditions. Consult an agricultural expert to confirm the diagnosis.'),
  ('Tomato___Late_blight', 'Tomato', 'Late blight', false,
   array['Large, dark, greasy-looking patches on leaves and stems', 'White fungal growth on leaf undersides in humid weather', 'Firm brown patches on fruit'],
   array['Remove and destroy visibly affected foliage immediately', 'Contact an agricultural expert urgently about fungicide treatment'],
   array['Avoid overhead watering; water at the base of the plant', 'Keep tomatoes away from potato fields where possible'],
   'The leaf pattern may indicate late blight, an aggressive disease that spreads quickly in cool, wet conditions and can destroy a tomato crop within days. Consult an agricultural expert urgently.'),
  ('Tomato___Leaf_Mold', 'Tomato', 'Leaf mold', false,
   array['Pale yellow spots on upper leaf surfaces', 'Olive-green to gray velvety growth underneath', 'Leaves curl, wither and drop'],
   array['Remove and destroy affected leaves', 'Ask an agricultural expert about fungicide options'],
   array['Improve ventilation, especially in greenhouses or tunnels', 'Avoid overhead watering and reduce humidity around plants'],
   'The leaf pattern may indicate leaf mold, a fungal disease favoured by high humidity and poor ventilation. Consult an agricultural expert to confirm the diagnosis.'),
  ('Tomato___Septoria_leaf_spot', 'Tomato', 'Septoria leaf spot', false,
   array['Many small circular spots with dark borders and tan centres', 'Lower leaves affected first', 'Heavy leaf drop in wet weather'],
   array['Remove and destroy affected lower leaves to slow upward spread', 'Ask an agricultural expert about fungicide options'],
   array['Avoid overhead watering; water at the base of the plant', 'Mulch and rotate crops to reduce soil-borne spores'],
   'The leaf pattern may indicate septoria leaf spot, a fungal disease that usually starts on lower leaves. Consult an agricultural expert to confirm the diagnosis.'),
  ('Tomato___Spider_mites Two-spotted_spider_mite', 'Tomato', 'Two-spotted spider mite', false,
   array['Fine yellow stippling or speckling on leaves', 'Fine webbing on leaf undersides in heavy infestations', 'Leaves bronze, dry and drop in hot, dry weather'],
   array['Check leaf undersides of this and nearby plants for mites and webbing', 'Ask an agricultural expert about miticide or biological control options'],
   array['Raise humidity around plants to slow mite reproduction', 'Keep plants well watered: drought-stressed plants suffer more'],
   'The leaf pattern may indicate two-spotted spider mite damage, a pest problem that worsens in hot, dry weather. Consult an agricultural expert to confirm the diagnosis.'),
  ('Tomato___Target_Spot', 'Tomato', 'Target spot', false,
   array['Circular brown lesions with concentric rings', 'Lesions on leaves, stems and fruit', 'Leaf drop starting low on the plant'],
   array['Remove and destroy affected leaves to slow spread', 'Ask an agricultural expert about fungicide options'],
   array['Ensure adequate plant spacing for airflow', 'Remove crop residue after harvest'],
   'The leaf pattern may indicate target spot, a fungal disease similar in appearance to early blight. Consult an agricultural expert to confirm the diagnosis.'),
  ('Tomato___Tomato_Yellow_Leaf_Curl_Virus', 'Tomato', 'Tomato yellow leaf curl virus', false,
   array['Upward-curling, yellowing leaves', 'Stunted plants with small leaves', 'Few or no fruit set'],
   array['There is no cure: isolate or remove severely affected plants to protect healthy ones', 'Ask an agricultural expert about whitefly management'],
   array['Inspect leaf undersides for whiteflies, the main way the virus spreads', 'Use insect-proof nets on nurseries and prefer resistant varieties'],
   'The leaf pattern may indicate tomato yellow leaf curl virus, spread by whiteflies, which has no cure once a plant is infected. Consult an agricultural expert to confirm the diagnosis.'),
  ('Tomato___Tomato_mosaic_virus', 'Tomato', 'Tomato mosaic virus', false,
   array['Mottled light- and dark-green patches on leaves', 'Distorted or fern-like leaves', 'Uneven ripening of fruit'],
   array['There is no cure: remove and destroy severely affected plants', 'Ask an agricultural expert about management options'],
   array['Wash hands and disinfect tools between handling plants', 'Use certified virus-free seed and resistant varieties'],
   'The leaf pattern may indicate tomato mosaic virus, which spreads easily through touch and tools and has no cure. Consult an agricultural expert to confirm the diagnosis.'),
  ('Tomato___healthy', 'Tomato', 'Healthy', true,
   array['No signs of disease detected'],
   array['No treatment needed'],
   array['Continue routine monitoring', 'Water consistently at the base of the plant'],
   'No signs of disease were detected on this tomato leaf. Keep monitoring the plants regularly.');

-- After the seed, so the 38 rows above are not audited as a change: they are the migration's own starting content.
create trigger audit_disease_knowledge
  after insert or update or delete on public.disease_knowledge
  for each row execute function public.audit_disease_knowledge();

-- ---------------------------------------------------------------------------------------------------------------------
-- disease-images bucket: farmers upload, nobody deletes through the client
-- ---------------------------------------------------------------------------------------------------------------------

-- The policies were defined in already-pushed migrations (20260901080000, 20260922080300, last changed by
-- 20261005080000_account_status), so they are replaced here rather than edited there.
--   * D11 (2026-10-10): the advisory is a farmer tool, and a disease case can only be made by a farmer, so only an
--     approved, unsuspended farmer may upload a photo, still only into their own `<uid>/` folder. Any other role's
--     upload could never become a case and would only be stored data nobody uses.
--   * No client delete: a disease case keeps its photo's path, and the case's report (GET /disease/cases/{id}) and the
--     expert's view of it need that photo for as long as the case exists. The app never removes one; account deletion
--     sweeps the bucket with the service role (backend/app/common/profile/repository.py), which needs no policy.
drop policy "disease_images_owner_write" on storage.objects;
create policy "disease_images_owner_write" on storage.objects for insert
  to authenticated
  with check (
    (bucket_id = 'disease-images') and (owner = (select auth.uid()))
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text)
    and (select public.is_account_approved())
    and not (select public.is_suspended())
    and (select public.caller_role()) = 'farmer'
  );

drop policy "disease_images_owner_delete" on storage.objects;

-- ---------------------------------------------------------------------------------------------------------------------
-- disease_cases: processing state, and D11 (farmers only)
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.disease_cases
  add column status text not null default 'pending' check (status in ('pending', 'predicted', 'failed')),
  add column failure_reason text;

update public.disease_cases dc set status = 'predicted'
 where exists (select 1 from public.disease_predictions p where p.disease_case_id = dc.id);

-- The state is the backend's to write (service role, after inference). `authenticated` holds no update grant on this
-- table, and the insert policy below pins a new case to `pending` with no reason, so a farmer cannot mark their own case
-- predicted or failed.
grant update (status, failure_reason) on public.disease_cases to service_role;

-- D11: the advisory is a farmer tool. The earlier conditions (owner, not suspended, approved account) stay.
alter policy "disease_cases_insert_owner" on public.disease_cases
  with check (
    user_id = (select auth.uid())
    and not (select public.is_suspended())
    and (select public.is_account_approved())
    and (select public.caller_role()) = 'farmer'
    and status = 'pending'
    and failure_reason is null
  );

-- ---------------------------------------------------------------------------------------------------------------------
-- consultations: the case a consultation is about
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.consultations
  add column disease_case_id uuid references public.disease_cases (id) on delete set null;
create index consultations_disease_case_id_idx on public.consultations (disease_case_id);

-- No insert guard existed for consultations before (its rules live in the insert policy), so this is a new BEFORE INSERT
-- trigger. It runs with the inserter's rights: under RLS a farmer only sees their own cases, and the explicit owner check
-- below makes the rule hold for the service role too. A consultation can point only at the requester's own case, so a
-- user cannot hand an expert someone else's photo (SRDS §36).
create function public.guard_consultations_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.disease_case_id is not null and not exists (
    select 1 from public.disease_cases dc where dc.id = new.disease_case_id and dc.user_id = new.user_id
  ) then
    raise exception 'A consultation can only refer to your own disease case' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_consultations_insert() from public, anon, authenticated;

create trigger a_guard_consultations_insert
  before insert on public.consultations
  for each row execute function public.guard_consultations_insert();

-- guard_consultations_update (20260927090000) already refuses a client change to any column but status and images (it
-- compares the whole row minus those), so `disease_case_id` is fixed after insert without redefining it.

-- ---------------------------------------------------------------------------------------------------------------------
-- The assigned expert reads the case and its prediction
-- ---------------------------------------------------------------------------------------------------------------------

-- Definer rights so the policies below can look at consultations without recursing through their RLS. A rejected,
-- cancelled or expired consultation no longer opens the case: the expert is no longer assigned in any useful sense.
create function public.is_case_expert(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.consultations c
     where c.disease_case_id = p_case_id
       and c.expert_id = (select auth.uid())
       and c.status not in ('rejected', 'cancelled', 'expired')
  );
$$;

revoke execute on function public.is_case_expert(uuid) from public, anon;
grant execute on function public.is_case_expert(uuid) to authenticated;

-- One permissive select policy per table stays (20260926080100): the expert is an extra branch of the existing one.
alter policy "disease_cases_select_owner_or_admin" on public.disease_cases
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or public.is_case_expert(id)
  );

alter policy "disease_predictions_select_owner_or_admin" on public.disease_predictions
  using (
    exists (
      select 1 from public.disease_cases dc
       where dc.id = disease_predictions.disease_case_id
         and (dc.user_id = (select auth.uid()) or (select public.is_admin()) or public.is_case_expert(dc.id))
    )
  );

-- ---------------------------------------------------------------------------------------------------------------------
-- consultation_assessments: the expert's answer to the AI result (BR-13)
-- ---------------------------------------------------------------------------------------------------------------------

create table public.consultation_assessments (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations (id) on delete cascade,
  expert_id uuid not null references public.profiles (id) on delete cascade,
  verdict text not null check (verdict in ('agree', 'correct', 'additional_diagnosis', 'request_information')),
  diagnosis text,
  recommendations text,
  created_at timestamptz not null default now(),
  -- Correcting the AI or adding a diagnosis means naming one.
  constraint consultation_assessments_diagnosis_required check (
    verdict not in ('correct', 'additional_diagnosis') or length(trim(coalesce(diagnosis, ''))) > 0
  )
);

create index consultation_assessments_consultation_id_idx on public.consultation_assessments (consultation_id, created_at);
create index consultation_assessments_expert_id_idx on public.consultation_assessments (expert_id);

alter table public.consultation_assessments enable row level security;

-- Only the assigned expert, while the consultation is open for work, with an approved and unsuspended account.
create policy "consultation_assessments_insert_expert" on public.consultation_assessments for insert
  to authenticated
  with check (
    expert_id = (select auth.uid())
    and not (select public.is_suspended())
    and (select public.is_account_approved())
    and (select public.is_approved_expert())
    and exists (
      select 1 from public.consultations c
       where c.id = consultation_assessments.consultation_id
         and c.expert_id = (select auth.uid())
         and c.status in ('accepted', 'in_progress')
    )
  );

create policy "consultation_assessments_select_participants" on public.consultation_assessments for select
  to authenticated
  using (
    exists (
      select 1 from public.consultations c
       where c.id = consultation_assessments.consultation_id
         and (c.user_id = (select auth.uid()) or c.expert_id = (select auth.uid()))
    )
    or (select public.is_admin())
  );

-- Append-only: an assessment is a record of advice given, so nobody edits or deletes it (a new one supersedes it).
grant select, insert on public.consultation_assessments to authenticated;
grant select, insert on public.consultation_assessments to service_role;

-- Tell the requester (the notifications lockdown pattern, 20260827080100: definer trigger, no client execute).
create function public.notify_consultation_assessed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requester uuid;
begin
  select c.user_id into v_requester from public.consultations c where c.id = new.consultation_id;
  perform public.create_notification(
    v_requester, 'consultation_assessed',
    jsonb_build_object('consultation_id', new.consultation_id, 'assessment_id', new.id, 'verdict', new.verdict)
  );
  return null;
end;
$$;

revoke execute on function public.notify_consultation_assessed() from public, anon, authenticated;

create trigger notify_consultation_assessed
  after insert on public.consultation_assessments
  for each row execute function public.notify_consultation_assessed();
