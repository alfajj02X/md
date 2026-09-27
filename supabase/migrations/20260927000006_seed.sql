-- Mechanic Dekho: seed — platform settings + service catalog (Berhampore launch)

insert into platform_settings (key, value) values
  ('booking_fee_paise',        '{"value": 4900}'),
  ('platform_commission_bps',  '{"value": 1000}'),
  ('provider_cash_capacity_paise', '{"value": 30000}'),
  ('geofence_radius_m',        '{"value": 100}'),
  ('offer_window_s',           '{"value": 15}'),
  ('start_otp_expiry_s',       '{"value": 600}'),
  ('start_otp_max_attempts',   '{"value": 5}'),
  ('free_reschedule_count',    '{"value": 1}'),
  ('service_city',             '{"value": "Berhampore"}'),
  ('service_district',         '{"value": "Murshidabad"}'),
  ('service_state',            '{"value": "West Bengal"}')
on conflict (key) do nothing;

-- Categories (13 launch categories)
insert into service_categories (slug, name, tagline, icon_name, sort_order) values
  ('appliance-repair', 'Appliance Repair', 'AC, fridge, washing machine & more', 'refrigerator', 1),
  ('electrician',      'Electrician',      'Wiring, switches, fans & fixtures', 'zap', 2),
  ('plumber',          'Plumber',          'Taps, tanks, blockages & fittings', 'droplet', 3),
  ('carpenter',        'Carpenter',        'Furniture repair & woodwork', 'hammer', 4),
  ('cleaning',         'Cleaning',         'Home deep cleaning & more', 'sparkles', 5),
  ('painting',         'Painting',         'Walls, rooms & full home', 'paintbrush', 6),
  ('pest-control',     'Pest Control',     'Cockroach, termite & mosquito', 'bug', 7),
  ('bike-repair',      'Bike Repair',      'Two-wheeler service at home', 'bike', 8),
  ('car-repair',       'Car Repair',       'Car service & minor repairs', 'car', 9),
  ('cctv-security',    'CCTV & Security',  'Cameras, installation & AMC', 'cctv', 10),
  ('laundry',          'Laundry',          'Wash, iron & dry clean pickup', 'shirt', 11),
  ('tailoring',        'Tailoring',        'Stitching & alterations', 'scissors', 12),
  ('photography',      'Photography',      'Events & portraits', 'camera', 13)
on conflict (slug) do nothing;

-- A starter set of services (catalog stays backend-driven; add more anytime)
insert into services (category_id, name, description, base_price_paise, duration_minutes, inclusions, exclusions)
select c.id, s.name, s.description, s.base_price_paise, s.duration_minutes, s.inclusions, s.exclusions
from service_categories c
join (values
  ('appliance-repair', 'AC Deep Service', 'Complete indoor/outdoor AC servicing with gas-pressure check', 49900, 60,
    array['Foam-jet cleaning', 'Filter wash', 'Cooling check'], array['Gas refill', 'Spare parts']),
  ('appliance-repair', 'Refrigerator Repair', 'Diagnosis & repair for all fridge brands', 29900, 45,
    array['Diagnosis', 'Minor repair labour'], array['Compressor replacement', 'Spare parts']),
  ('electrician', 'Switch & Socket Repair', 'Repair/replacement of switches, sockets & boards', 14900, 30,
    array['Labour & inspection'], array['Branded switches (MRP extra)']),
  ('electrician', 'Ceiling Fan Installation', 'Install or replace ceiling fans safely', 19900, 30,
    array['Installation labour', 'Safety check'], array['Fan unit cost']),
  ('plumber', 'Tap & Mixer Repair', 'Fix leaks, replace cartridges & washers', 14900, 30,
    array['Labour & minor spares'], array['New tap unit (MRP extra)']),
  ('plumber', 'Bathroom Blockage Removal', 'Drain & pipe blockage clearing', 39900, 60,
    array['Blockage removal', 'Pipe inspection'], array['Pipe replacement']),
  ('carpenter', 'Furniture Repair', 'Repair of beds, tables, wardrobes & hinges', 24900, 60,
    array['Labour & minor hardware'], array['Plywood / laminate material']),
  ('cleaning', 'Full Home Deep Cleaning', '4BHK deep cleaning with machines & chemicals', 299900, 240,
    array['All rooms & bathrooms', 'Kitchen degreasing'], array['Sofa shampoo (add-on)']),
  ('cleaning', 'Bathroom Deep Cleaning', 'Tiles, fittings & sanitary deep clean', 49900, 60,
    array['Descaling', 'Fitting polish'], array['Plumbing repairs']),
  ('painting', '1BHK Full Painting', 'Walls & ceiling with premium emulsion', 899900, 480,
    array['Putty touch-up', 'Two coats emulsion'], array['Paint material (as per choice)']),
  ('pest-control', 'Cockroach Control', 'Gel + spray treatment for kitchen & home', 89900, 45,
    array['Full home treatment', '30-day service warranty'], array['Termite drilling']),
  ('bike-repair', 'Bike General Service', 'Engine oil, filters, brake & chain check at home', 59900, 90,
    array['Labour & inspection', 'Basic consumables'], array['Engine oil & parts (MRP extra)']),
  ('car-repair', 'Car AC Repair', 'Cooling diagnosis & repair at your doorstep', 79900, 90,
    array['Diagnosis & gas check'], array['Compressor & parts']),
  ('cctv-security', 'CCTV Installation (2 Cam)', '2-camera HD setup with DVR & mobile viewing', 499900, 180,
    array['Installation & configuration', 'Mobile app setup'], array['Extra cabling beyond 30m']),
  ('laundry', 'Wash & Iron (per kg)', 'Pickup & 48-hr delivery, per kilo', 9900, 2880,
    array['Doorstep pickup', 'Wash & press'], array['Dry-clean-only garments']),
  ('tailoring', 'Blouse Stitching', 'Custom blouse stitching with fitting', 34900, 1440,
    array['Stitching & fitting'], array['Fabric & lining']),
  ('photography', 'Birthday Event Shoot', '2-hour candid + traditional coverage', 499900, 120,
    array['Edited photos (100+)', 'Online gallery'], array['Prints & albums'])
) as s(cat_slug, name, description, base_price_paise, duration_minutes, inclusions, exclusions)
  on c.slug = s.cat_slug
on conflict do nothing;
