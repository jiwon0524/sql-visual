# Domain And Naver Search Setup

## Change The Website Address

The current address is:

```text
https://jiwon0524.github.io/sql-visual/
```

To use a cleaner address such as `https://sqlvisual.kr`, you need to buy a domain first. After that:

1. Add the domain in GitHub Pages settings for this repository.
2. Add a `CNAME` DNS record at the domain provider.
3. Add a `CNAME` file to the frontend public folder with the domain name.
4. Build with `VITE_BASE_PATH=/` before deploying to that custom domain.

Do not add a `CNAME` file until the real domain is chosen.

## Show Up In Naver Search

Search exposure is not instant and cannot be guaranteed by code alone. The site should be registered in Naver Search Advisor after deployment.

Use these URLs:

```text
Site URL:
https://jiwon0524.github.io/sql-visual/

Sitemap:
https://jiwon0524.github.io/sql-visual/sitemap.xml
```

Recommended steps:

1. Open Naver Search Advisor.
2. Add the site URL.
3. Verify ownership with the HTML tag or HTML file that Naver gives you.
4. Submit the sitemap URL.
5. Request collection for the main page.
6. Wait for Naver to crawl and index the site.

The project already includes:

- Search title and description meta tags
- `canonical` URL
- Open Graph metadata
- JSON-LD WebApplication schema
- `sitemap.xml`
- `robots.txt`

If a custom domain is added later, update every URL in:

- `frontend/index.html`
- `frontend/public/sitemap.xml`
- `frontend/public/robots.txt`
