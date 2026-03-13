"use strict";
(function(){
    /*config Estado global*/
  
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

    // Auth check 
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

    // Load header into #header
    function loadHeader() {
        fetch('header.html')
            .then(response => response.text())
            .then(data => {
                const el = document.getElementById('header');
                if (el) el.innerHTML = data;
            })
            .catch(() => {});
    }

    // Create a pokemon card 
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

        // Abilities 
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

    // Initialize Pokemon grid 
    function initPokemonGrid() {
        const container = document.getElementById('pokemon');
        if (!container) return;

        const listUrl = 'https://pokeapi.co/api/v2/pokemon?limit=10000';
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

    // --- Battle page helpers ---
    async function fetchPokemonList(limit = 200) {
        const url = `https://pokeapi.co/api/v2/pokemon?limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('failed list');
        const data = await res.json();
        return (data.results || []).map(r => r.name);
    }

    function populateBattleSelects(names) {
        const s1 = document.getElementById('poke1');
        const s2 = document.getElementById('poke2');
        if (!s1 || !s2) return;
        s1.innerHTML = '';
        s2.innerHTML = '';
        const defOpt = document.createElement('option');
        defOpt.value = '';
        defOpt.textContent = '-- elegir --';
        s1.appendChild(defOpt.cloneNode(true));
        s2.appendChild(defOpt.cloneNode(true));
        names.forEach(n => {
            const o1 = document.createElement('option'); o1.value = n; o1.textContent = n; s1.appendChild(o1);
            const o2 = document.createElement('option'); o2.value = n; o2.textContent = n; s2.appendChild(o2);
        });
    }

    async function getPokemonDetails(name) {
        const url = `https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(name)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('detail fail');
        return res.json();
    }

    function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

    async function startBattle(selected1, selected2) {
        const logEl = document.getElementById('battleLog');
        const winnerEl = document.getElementById('winner');
        const btn = document.getElementById('startBattle');
        if (!selected1 || !selected2) { alert('Seleccione dos Pokémon.'); return; }
        if (selected1 === selected2) { alert('Seleccione dos Pokémon distintos.'); return; }
        btn.disabled = true;
        logEl.innerHTML = '';
        winnerEl.innerHTML = '';

        let p1, p2;
        try{ p1 = await getPokemonDetails(selected1); p2 = await getPokemonDetails(selected2); }
        catch(e){ alert('Error cargando detalles de Pokémon.'); btn.disabled = false; return; }

        const combatants = [
            {name: p1.name, img: (p1.sprites && p1.sprites.other && p1.sprites.other['official-artwork'] && p1.sprites.other['official-artwork'].front_default) || p1.sprites.front_default || '', hp:100, turns:0, defend:false},
            {name: p2.name, img: (p2.sprites && p2.sprites.other && p2.sprites.other['official-artwork'] && p2.sprites.other['official-artwork'].front_default) || p2.sprites.front_default || '', hp:100, turns:0, defend:false}
        ];

        document.getElementById('label1').textContent = combatants[0].name;
        document.getElementById('label2').textContent = combatants[1].name;
        document.getElementById('img1').src = combatants[0].img;
        document.getElementById('img2').src = combatants[1].img;
        document.getElementById('hp1').textContent = 'Vida: 100%';
        document.getElementById('hp2').textContent = 'Vida: 100%';

        let attackerIndex = Math.random() < 0.5 ? 0 : 1;
        let turn = 1;
        function log(msg){ const d = document.createElement('div'); d.textContent = msg; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; }

        while (combatants[0].hp > 0 && combatants[1].hp > 0) {
            const attacker = combatants[attackerIndex];
            const defender = combatants[1-attackerIndex];
            attacker.turns += 1;
            log(`Turno ${turn} - Es el turno de ${attacker.name}`);

            // rules: special attack allowed after 3 turns, special defense after 2 turns
            const allowSpecAtk = attacker.turns >= 3;
            const allowSpecDef = attacker.turns >= 2;

            // decide action (simple AI/random): normal, specialAttack, specialDefense
            let action = 'normal';
            const r = Math.random();
            if (allowSpecAtk && r > 0.78) action = 'specialAttack';
            else if (allowSpecDef && r > 0.68 && r <= 0.78) action = 'specialDefense';

            if (action === 'specialDefense') {
                // can fail randomly
                const fail = Math.random() < 0.2; // 20% fail
                if (fail) log(`${attacker.name} intentó defensa especial y falló.`);
                else { attacker.defend = true; log(`${attacker.name} usó Defensa Especial y reducirá el próximo daño.`); }
            } else {
                // attack
                let damage;
                let miss;
                if (action === 'normal') { miss = Math.random() < 0.15; damage = Math.floor(8 + Math.random()*8); }
                else { miss = Math.random() < 0.25; damage = Math.floor(20 + Math.random()*16); }
                if (miss) { log(`${attacker.name} atacó con ${action} y falló.`); }
                else {
                    if (defender.defend) { damage = Math.ceil(damage * 0.5); defender.defend = false; log(`${defender.name} tenía defensa activa: daño reducido.`); }
                    defender.hp = Math.max(0, defender.hp - damage);
                    const pct = Math.round(defender.hp);
                    log(`${attacker.name} usó ${action} y causó ${damage} de daño. ${defender.name} queda con ${pct}% de vida.`);
                    if (attackerIndex === 0) document.getElementById('hp2').textContent = `Vida: ${pct}%`;
                    else document.getElementById('hp1').textContent = `Vida: ${pct}%`;
                }
            }

            await sleep(700);
            if (combatants[0].hp <= 0 || combatants[1].hp <= 0) break;
            attackerIndex = 1 - attackerIndex;
            turn += 1;
        }

        const winner = combatants[0].hp > combatants[1].hp ? combatants[0] : combatants[1];
        log(`La batalla terminó. Ganador: ${winner.name}`);
        winnerEl.innerHTML = '';
        const wtitle = document.createElement('h2'); wtitle.textContent = 'GANADOR'; winnerEl.appendChild(wtitle);
        const wimg = document.createElement('img'); wimg.src = winner.img; wimg.style.maxWidth = '220px'; winnerEl.appendChild(wimg);

        btn.disabled = false;
    }

    async function initBattlePage(){
        const el = document.getElementById('poke1');
        if (!el) return; // not on this page
        try{
            const names = await fetchPokemonList(200);
            populateBattleSelects(names);
        }catch(e){ console.warn('No se pudo cargar lista de Pokémon', e); }
        const startBtn = document.getElementById('startBattle');
        if (startBtn) startBtn.addEventListener('click', async ()=>{
            const s1 = document.getElementById('poke1').value;
            const s2 = document.getElementById('poke2').value;
            await startBattle(s1,s2);
        });
    }

    // Run auth check immediately so page redirects early if needed
    checkAuth();

    // On DOM ready, load header and footer. initPokemonGrid is called only where needed.
    function onDomReady() {
        loadHeader();
        loadFooter();
        // initialize battle page if present
        if (window.app && typeof window.app.initBattlePage === 'function') {
            window.app.initBattlePage();
        }
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
    window.app.initBattlePage = initBattlePage;
    window.app.startBattle = startBattle;
    window.app.initBattlePage = initBattlePage;
    window.app.startBattle = startBattle;

})();