// paperhead.app → serverer notesbogen fra GitHub Pages (tpixel.github.io/apps)
// "/" viser bogen; alle andre stier spejles 1:1, så webmanifest, rapporter m.m. virker.
export default {
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;
    if (path === "/" || path === "/index.html") path = "/hoved-bog.html";
    const upstream = "https://tpixel.github.io/apps" + path + url.search;
    const res = await fetch(upstream, {
      headers: { "User-Agent": "paperhead-proxy" },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    const h = new Headers(res.headers);
    h.set("x-paperhead", "1");
    return new Response(res.body, { status: res.status, headers: h });
  },
};
