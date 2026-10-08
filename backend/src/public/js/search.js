// Live-Vorschläge für das Suchfeld in der Navigation.
// Alle Texte werden mit textContent eingefügt (kein HTML aus Daten).
(function () {
    "use strict";

    var form = document.getElementById("globalSearchForm");
    var input = document.getElementById("globalSearchInput");
    var box = document.getElementById("globalSearchResults");

    if (!form || !input || !box) {
        return;
    }

    var SECTIONS = [
        { key: "companies", label: "Firmen", icon: "bi-buildings" },
        { key: "contacts", label: "Kontakte", icon: "bi-people" },
        { key: "tickets", label: "Tickets", icon: "bi-ticket-detailed" },
        { key: "assets", label: "Assets", icon: "bi-pc-display" }
    ];

    var timer = null;
    var controller = null;
    var lastQuery = "";
    var active = -1;

    function links() {
        return box.querySelectorAll("a.list-group-item");
    }

    function hide() {
        box.classList.add("d-none");
        active = -1;
    }

    function setActive(index) {
        var items = links();
        if (!items.length) { return; }
        if (index < 0) { index = items.length - 1; }
        if (index >= items.length) { index = 0; }
        items.forEach(function (el, i) { el.classList.toggle("active", i === index); });
        items[index].scrollIntoView({ block: "nearest" });
        active = index;
    }

    function message(text) {
        box.textContent = "";
        var el = document.createElement("div");
        el.className = "list-group-item text-muted small";
        el.textContent = text;
        box.appendChild(el);
        box.classList.remove("d-none");
    }

    function render(data) {
        box.textContent = "";
        active = -1;

        var any = false;

        SECTIONS.forEach(function (section) {
            var part = data[section.key];
            if (!part || !part.items.length) { return; }
            any = true;

            var head = document.createElement("div");
            head.className = "list-group-item bg-light small fw-bold text-uppercase text-muted";
            var icon = document.createElement("i");
            icon.className = "bi " + section.icon + " me-2";
            head.appendChild(icon);
            head.appendChild(document.createTextNode(section.label + " (" + part.total + ")"));
            box.appendChild(head);

            part.items.forEach(function (item) {
                var a = document.createElement("a");
                a.className = "list-group-item list-group-item-action";
                a.href = item.url;

                var title = document.createElement("div");
                title.className = "fw-semibold text-truncate";
                title.textContent = item.title;
                a.appendChild(title);

                if (item.detail) {
                    var detail = document.createElement("div");
                    detail.className = "small text-truncate";
                    detail.style.opacity = "0.7";
                    detail.textContent = item.detail;
                    a.appendChild(detail);
                }

                box.appendChild(a);
            });
        });

        if (!any) {
            message("Keine Treffer");
            return;
        }

        var all = document.createElement("a");
        all.className = "list-group-item list-group-item-action text-center small";
        all.href = "/crm/search?q=" + encodeURIComponent(data.query);
        all.textContent = "Alle Treffer anzeigen";
        box.appendChild(all);

        box.classList.remove("d-none");
    }

    function search() {
        var q = input.value.trim();

        if (q.length < 2) {
            hide();
            return;
        }

        if (q === lastQuery) {
            box.classList.remove("d-none");
            return;
        }

        lastQuery = q;

        if (controller) { controller.abort(); }
        controller = new AbortController();

        fetch("/crm/search/suggest?q=" + encodeURIComponent(q), {
            signal: controller.signal,
            credentials: "same-origin",
            headers: { "Accept": "application/json" }
        })
            .then(function (res) {
                if (!res.ok) { throw new Error("HTTP " + res.status); }
                return res.json();
            })
            .then(render)
            .catch(function (err) {
                if (err.name === "AbortError") { return; }
                lastQuery = "";
                message("Die Suche ist gerade nicht erreichbar.");
            });
    }

    input.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(search, 200);
    });

    input.addEventListener("focus", function () {
        if (box.children.length) { box.classList.remove("d-none"); }
    });

    input.addEventListener("keydown", function (event) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive(active + 1);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(active - 1);
        } else if (event.key === "Escape") {
            hide();
            input.blur();
        } else if (event.key === "Enter" && active >= 0) {
            var items = links();
            if (items[active]) {
                event.preventDefault();
                window.location.href = items[active].href;
            }
        }
    });

    document.addEventListener("click", function (event) {
        if (!form.contains(event.target)) { hide(); }
    });

    // Tastenkürzel "/" springt ins Suchfeld
    document.addEventListener("keydown", function (event) {
        var tag = (event.target && event.target.tagName) || "";
        var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (event.target && event.target.isContentEditable);

        if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            input.focus();
            input.select();
        }
    });
})();
