"use strict";
(function(){
    /*config Estado global*/
    const API_BASE='https://pokeapi.co/api/v2/pokemon/ditto';
    const PAGE_LIMIT=24;
    const CONCURRENCY=12;

    // Referencias al DOM (pueden no existir en todas las páginas)
    const els={
            results: document.getElementById('results'),
            tplCard: document.getElementById('pokemon-card-template'),
            tplSkel: document.getElementById('pokemon-card-skeleton'),
            form: document.getElementById('controlsForm'),
            q: document.getElementById('q'),
            typeFilter: document.getElementById('typeFilter'),
            sortBy: document.getElementById('sortBy'),
            btnMore: document.getElementById('loadMore'),
    };

    // Auth check (moved from page_2.html)
    function checkAuth() {
        const raw = localStorage.getItem('authToken');
        if (!raw) {
            window.location.href = 'form.html';
            return;
        }
        try {
            const obj = JSON.parse(raw);
            if (!obj.token || !obj.expires || Date.now() > obj.expires) {
                localStorage.removeItem('authToken');
                window.location.href = 'form.html';
            }
        } catch (e) {
            localStorage.removeItem('authToken');
            window.location.href = 'form.html';
        }
    }

    // Load header into #header (moved from page_2.html)
    function loadHeader() {
        fetch('header.html')
            .then(response => response.text())
            .then(data => {
                const el = document.getElementById('header');
                if (el) el.innerHTML = data;
            })
            .catch(() => {});
    }

    // Create a pokemon card (copied from page_2.html)
    function createCard(data) {
        const name = data.name || (data.forms && data.forms[0] && data.forms[0].name) || 'Desconocido';
        const img = (data.sprites && data.sprites.other && data.sprites.other['official-artwork'] && data.sprites.other['official-artwork'].front_default)
            || (data.sprites && data.sprites.front_default) || '';
        const id = data.id || 'N/A';
        const types = (data.types || []).map(t => (t.type && t.type.name) || t).filter(Boolean);

        const card = document.createElement('div');
        card.className = 'pokemon-card';

        if (img) {
            const image = document.createElement('img');
            image.src = img;
            image.alt = name;
            card.appendChild(image);
        }

        const title = document.createElement('h2');
        title.textContent = name;
        card.appendChild(title);

        const idEl = document.createElement('p');
        idEl.className = 'pokemon-id';
        idEl.textContent = `ID: ${id}`;
        card.appendChild(idEl);

        const typesWrapper = document.createElement('div');
        typesWrapper.className = 'pokemon-types';
        if (types.length) {
            types.forEach(tp => {
                const t = document.createElement('span');
                t.className = 'pokemon-type';
                t.textContent = tp;
                typesWrapper.appendChild(t);
            });
        } else {
            const none = document.createElement('span');
            none.className = 'pokemon-type';
            none.textContent = 'Tipo desconocido';
            typesWrapper.appendChild(none);
        }
        card.appendChild(typesWrapper);

        // Abilities (first two)
        const abilitiesWrapper = document.createElement('div');
        abilitiesWrapper.className = 'pokemon-abilities';
        const abilities = (data.abilities || []).slice(0,2).map(a => (a.ability && a.ability.name) || a.name || a).filter(Boolean);
        if (abilities.length) {
            abilities.forEach(ab => {
                const span = document.createElement('span');
                span.className = 'pokemon-type';
                span.textContent = ab;
                abilitiesWrapper.appendChild(span);
            });
        } else {
            const span = document.createElement('span');
            span.className = 'pokemon-type';
            span.textContent = 'Sin habilidades';
            abilitiesWrapper.appendChild(span);
        }
        card.appendChild(abilitiesWrapper);

        // Base stats
        const statsWrapper = document.createElement('div');
        statsWrapper.className = 'pokemon-stats';
        const statsList = document.createElement('ul');
        (data.stats || []).forEach(st => {
            const li = document.createElement('li');
            const statName = (st.stat && st.stat.name) || 'stat';
            const val = st.base_stat != null ? st.base_stat : '-';
            li.textContent = `${statName}: ${val}`;
            statsList.appendChild(li);
        });
        statsWrapper.appendChild(statsList);
        card.appendChild(statsWrapper);

        return card;
    }

    // Initialize Pokemon grid (moved from page_2.html)
    function initPokemonGrid() {
        const container = document.getElementById('pokemon');
        if (!container) return;

        const listUrl = 'https://pokeapi.co/api/v2/pokemon?limit=1000';
        fetch(listUrl)
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch list');
                return res.json();
            })
            .then(listData => {
                const results = listData.results || [];
                if (!results.length) {
                    throw new Error('No results');
                }

                const detailPromises = results.map(r =>
                    fetch(r.url)
                        .then(rsp => (rsp.ok ? rsp.json() : Promise.reject(new Error('detail fetch failed'))))
                        .catch(err => {
                            console.warn('Error fetching', r.url, err);
                            return null;
                        })
                );

                return Promise.all(detailPromises);
            })
            .then(details => {
                // cache details for filtering and reuse
                const list = (details || []).filter(Boolean);
                window.app._pokemonData = list;
                container.innerHTML = '';
                list.forEach(d => container.appendChild(createCard(d)));
                // populate type filter options
                populateTypeFilter(list);
            })
            .catch(err => {
                console.warn('Fallo al obtener lista o detalles, uso fallback:', err);
                const fallback = {
                    id: 132,
                    name: 'ditto',
                    sprites: { other: { 'official-artwork': { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/132.png' } } },
                    types: [{ type: { name: 'normal' } }]
                };
                container.innerHTML = '';
                container.appendChild(createCard(fallback));
            });
    }

    // Populate type select with unique types from loaded data
    function populateTypeFilter(list) {
        if (!list || !list.length) return;
        const sel = document.getElementById('typeFilter');
        if (!sel) return;
        const typesSet = new Set();
        list.forEach(p => {
            (p.types || []).forEach(t => {
                const name = (t.type && t.type.name) || t;
                if (name) typesSet.add(name);
            });
        });
        const types = Array.from(typesSet).sort();
        // clear and add default
        sel.innerHTML = '';
        const optAll = document.createElement('option');
        optAll.value = '';
        optAll.textContent = 'Todos';
        sel.appendChild(optAll);
        types.forEach(tp => {
            const o = document.createElement('option');
            o.value = tp;
            o.textContent = tp;
            sel.appendChild(o);
        });
    }

    // Apply filters based on UI inputs (type, id, name)
    function applyFilters() {
        const data = (window.app && window.app._pokemonData) || [];
        const container = document.getElementById('pokemon');
        if (!container) return;
        const typeVal = (document.getElementById('typeFilter') || {}).value || '';
        const idValRaw = (document.getElementById('filterId') || {}).value || '';
        const nameVal = ((document.getElementById('filterName') || {}).value || '').trim().toLowerCase();

        const idVal = idValRaw !== '' ? Number(idValRaw) : null;

        let filtered = data;
        if (typeVal) {
            filtered = filtered.filter(p => (p.types || []).some(t => ((t.type && t.type.name) || t) === typeVal));
        }
        if (idVal !== null && !Number.isNaN(idVal)) {
            filtered = filtered.filter(p => p.id === idVal);
        }
        if (nameVal) {
            filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(nameVal));
        }

        container.innerHTML = '';
        if (!filtered.length) {
            const msg = document.createElement('p');
            msg.textContent = 'No se encontraron pokémon con esos filtros.';
            container.appendChild(msg);
            return;
        }
        filtered.forEach(p => container.appendChild(createCard(p)));
    }

    // Run auth check immediately so page redirects early if needed
    checkAuth();

    // On DOM ready, load header and footer. initPokemonGrid is called only where needed.
    function onDomReady() {
        loadHeader();
        loadFooter();
    }
    document.addEventListener('DOMContentLoaded', onDomReady);

    // Load footer into #footer if present. If it's an iframe, set src.
    function loadFooter() {
        const el = document.getElementById('footer');
        if (!el) return;
        if (el.tagName === 'IFRAME') {
            // ensure src is set
            try { el.src = el.src || 'footer.html'; } catch (e) {}
            return;
        }
        fetch('footer.html')
            .then(r => r.text())
            .then(html => { el.innerHTML = html; })
            .catch(() => {});
    }

    // Expose for manual calls / debugging
    window.app = window.app || {};
    window.app.checkAuth = checkAuth;
    window.app.loadHeader = loadHeader;
    window.app.initPokemonGrid = initPokemonGrid;
    window.app.loadFooter = loadFooter;
    window.app.applyFilters = applyFilters;

})();