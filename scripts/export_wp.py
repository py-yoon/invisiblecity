"""wp.db(sqlite) → wp-export.json. 사용: python3 export_wp.py wp.db out.json"""
import json, re, sqlite3, sys
from urllib.parse import unquote

db = sqlite3.connect(sys.argv[1]); db.row_factory = sqlite3.Row
q = lambda s, *a: [dict(r) for r in db.execute(s, a)]

meta = {}
for r in q("select post_id, meta_key, meta_value from wp_postmeta"):
    meta.setdefault(r['post_id'], {})[r['meta_key']] = r['meta_value']
attach = {r['ID']: meta.get(r['ID'], {}).get('_wp_attached_file') for r in q("select ID from wp_posts where post_type='attachment'")}
terms = {r['term_taxonomy_id']: r for r in q("select tt.term_taxonomy_id, tt.taxonomy, t.name, t.slug from wp_term_taxonomy tt join wp_terms t using(term_id) where taxonomy in ('category','post_tag')")}
rel = {}
for r in q("select object_id, term_taxonomy_id from wp_term_relationships"):
    t = terms.get(r['term_taxonomy_id'])
    if t: rel.setdefault(r['object_id'], []).append(t)

items = []
for p in q("select * from wp_posts where post_type in ('post','page') and post_status in ('publish','draft','private') order by post_date"):
    m = meta.get(p['ID'], {})
    ts = rel.get(p['ID'], [])
    items.append({
        'id': p['ID'], 'type': p['post_type'], 'status': p['post_status'],
        'title': p['post_title'], 'slug': unquote(p['post_name']) or str(p['ID']),
        'date': p['post_date'], 'modified': p['post_modified'],
        'excerpt': p['post_excerpt'],
        'description': m.get('rank_math_description', ''),
        'thumbnail': attach.get(int(m['_thumbnail_id'])) if m.get('_thumbnail_id', '').isdigit() else None,
        'categories': [unquote(t['name']) for t in ts if t['taxonomy'] == 'category'],
        'tags': [t['name'] for t in ts if t['taxonomy'] == 'post_tag'],
        'content': p['post_content'],
    })
cats = {unquote(t['name']): unquote(t['slug']) for t in terms.values() if t['taxonomy'] == 'category'}
tags = {t['name']: unquote(t['slug']) for t in terms.values() if t['taxonomy'] == 'post_tag'}
json.dump({'items': items, 'categories': cats, 'tags': tags}, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
print(len(items), 'items', len(cats), 'cats', len(tags), 'tags')
