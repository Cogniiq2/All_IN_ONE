# Archived route source

A leading underscore makes this a **private folder** in the Next.js App Router:
nothing beneath it is compiled into a route, so none of it is publicly
reachable. The source is kept here rather than deleted, so it can be brought
back or mined for content later.

## `coming-soon/`

Two unfinished landing pages — `gelateria-michele` and `cafetaria-bayreuth` —
that were previously served as public `200` pages. Both were incomplete and
both carried an email capture form whose submit handler only set local state:
an address typed into them was never sent anywhere and never stored.

Shipping that publicly meant collecting an email address in a way that looked
like a signup and was not one, so the routes were withdrawn. Direct requests
now return the site's normal `404`.

They were deliberately **not** redirected: there is no equivalent page to send
someone to, and pointing them at the homepage would imply the projects moved
rather than that they are not ready.

To bring one back: move the folder to `app/coming-soon/`, wire the form to a
real endpoint, and add the route to `app/sitemap.ts`.
