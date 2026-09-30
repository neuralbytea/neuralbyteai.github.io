# NeuralBytea website

Company site for NeuralBytea: the Odoo 18 apps published on the
[Odoo Apps Store](https://apps.odoo.com/apps/browse?repo_maintainer_id=1172096).
Live at https://neuralbytea.github.io/neuralbyteai.github.io/ once GitHub Pages is enabled.

Static site, no build step. Same architecture as the personal portfolio:
`portfolio_data.yaml` holds all content, `assets/app.js` loads it with js-yaml
and renders each page.

## Pages
| File | Purpose |
|---|---|
| `index.html` | Home: hero, stats, product lines, featured apps, contact CTA |
| `apps.html` | All apps with product-line filter |
| `project.html?id=<technical_name>` | App detail (one template for every app) |
| `contact.html` | Contact form (Formspree) |
| `404.html`, `robots.txt`, `sitemap.xml` | Standard |

## Add or update an app
Edit the `projects:` list in `portfolio_data.yaml` (id = technical module name),
add a banner at `assets/images/apps/<id>.jpg`, then add the URL to `sitemap.xml`.
Apps without an image get an automatic price cover.

## Run locally
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy
GitHub repo settings > Pages > Deploy from branch `main` / root.

## To confirm before launch
- Contact email is neuralbytea@gmail.com; Hammad Ali is listed as representative. The Formspree form ID is still Hammad's account (submissions go to his inbox); create a NeuralBytea form to change that.
- App prices and edition labels come from the manifests; check them against the store pages.
