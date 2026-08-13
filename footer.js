// Site-wide footer component.
// Single source of truth: every page includes an empty
// <div id="site-footer"></div> and this script fills it in, so the
// markup only needs to be edited here instead of on every page.
//
// Placeholders to fill in with real data:
//   [usuario_do_instagram]  -> Instagram handle (used in both the link and the label)
//   [email@exemplo.com]     -> contact e-mail (used in both the mailto: link and the label)
//   [Nome do Fundador 1/2]  -> founders' names
(function () {
    // footer.js always lives at the site root next to img/, but pages that
    // include it sit at different depths (e.g. empresas/index.html uses
    // src="../footer.js"), so a plain "img/logo.png" would resolve against
    // the *page's* URL, not this script's. Resolve it against this script's
    // own location instead so the logo works from any depth.
    const LOGO_SRC = new URL('img/logo.png', document.currentScript.src).href;

    const FOOTER_HTML = `
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div class="grid gap-10 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] md:items-center">
                <img src="${LOGO_SRC}" alt="Cycle Sown" class="h-48 w-auto shrink-0 brightness-0 invert mx-auto justify-self-center">

                <section aria-labelledby="footer-contact-heading">
                    <h3 id="footer-contact-heading" class="font-display text-xl font-semibold mb-4">Contato</h3>
                    <ul class="space-y-3">
                        <li>
                            <a href="https://instagram.com/[usuario_do_instagram]" target="_blank" rel="noopener noreferrer"
                               aria-label="Instagram da Cycle Sown, abre em nova aba"
                               class="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors">
                                <!-- Recent lucide releases dropped brand/logo icons from the core
                                     set, so the Instagram glyph is inlined here (same 24x24 stroke
                                     style as the lucide-rendered mail icon below) instead of relying
                                     on a data-lucide name that no longer resolves. -->
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide w-5 h-5" aria-hidden="true">
                                    <rect width="20" height="20" x="2" y="2" rx="5" ry="5"></rect>
                                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                                    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"></line>
                                </svg>
                                <span>@[usuario_do_instagram]</span>
                            </a>
                        </li>
                        <li>
                            <a href="mailto:[email@exemplo.com]"
                               aria-label="Enviar e-mail para a Cycle Sown"
                               class="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors">
                                <i data-lucide="mail" class="w-5 h-5" aria-hidden="true"></i>
                                <span>[email@exemplo.com]</span>
                            </a>
                        </li>
                    </ul>
                </section>

                <section aria-labelledby="footer-founders-heading">
                    <h3 id="footer-founders-heading" class="font-display text-xl font-semibold mb-4">Fundadores</h3>
                    <ul class="space-y-2 text-white/80">
                        <li>[Nome do Fundador 1]</li>
                        <li>[Nome do Fundador 2]</li>
                    </ul>
                </section>
            </div>

            <div class="mt-10 pt-6 border-t border-white/15 text-sm text-white/70 text-center">
                © 2026 Cycle Sown. Todos os direitos reservados.
            </div>
        </div>
    `;

    function mountFooter() {
        const mountPoint = document.getElementById('site-footer');
        if (!mountPoint) return;

        const footer = document.createElement('footer');
        // Carry over any classes put on the placeholder (e.g. "no-print"
        // on relatorios.html so the footer doesn't show up on the printed laudo).
        footer.className = ['text-white', mountPoint.className].filter(Boolean).join(' ');
        footer.style.backgroundColor = 'var(--forest-green)';
        footer.innerHTML = FOOTER_HTML;
        mountPoint.replaceWith(footer);

        if (window.lucide?.createIcons) {
            window.lucide.createIcons();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountFooter);
    } else {
        mountFooter();
    }
})();
