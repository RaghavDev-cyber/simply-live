const API_URL = (typeof window !== 'undefined' && window.location.origin && window.location.origin.startsWith('http')) ? `${window.location.origin}/api` : 'http://localhost:3000/api';
let mapInstance;
let markersLayer;

const app = {
    currentLocation: null,
    currentCategory: 'all',
    currentFoodFilter: 'any',
    currentDetailId: null,
    selectedStarRating: 5,
    services: [], 
    loggedInProvider: null,
    activeChatServiceId: null,
    socket: null,
    mapFilterActiveOnly: false,

    init() {
        this.initSocket();
        this.startRealTimeTracking();
        this.fetchServices();
        this.initStarRating();
        this.updateFavoritesCount();
        this.restoreProviderSession();
    },

    initSocket() {
        try {
            if (typeof io !== 'undefined') {
                this.socket = io();
                this.socket.on('new_message', (msg) => {
                    this.handleIncomingMessage(msg);
                });
            }
        } catch(e) {
            console.warn("Socket.io init skipped", e);
        }
    },

    showToast(msg) {
        const toast = document.getElementById('toast');
        document.getElementById('toast-msg').innerText = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 4000);
    },

    async fetchServices() {
        try {
            const res = await fetch(`${API_URL}/services`);
            this.services = await res.json();
            this.renderHomeRecommendations();
            if (document.getElementById('view-search-results').classList.contains('active')) this.renderSearchResults();
            if (document.getElementById('view-map').classList.contains('active')) this.updateMap();
        } catch (e) {
            console.error("Failed to connect to backend", e);
        }
    },

    startRealTimeTracking() {
        const textEl = document.getElementById('user-location-text');
        textEl.innerHTML = `<i class="fa-solid fa-satellite-dish fa-beat-fade"></i> GPS Live Tracking...`;

        if (!navigator.geolocation) {
            textEl.innerHTML = `<i class="fa-solid fa-satellite-dish"></i> Geolocation not supported`;
            return;
        }

        navigator.geolocation.watchPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const isFirstTime = !this.currentLocation;
                this.currentLocation = { lat, lng };

                if (isFirstTime) {
                    try {
                        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`);
                        const data = await res.json();
                        let locName = data.address.suburb || data.address.neighbourhood || data.address.city || "Live Location";
                        textEl.innerHTML = `<span style="color:var(--success);"><i class="fa-solid fa-satellite-dish fa-beat-fade"></i> Live:</span> ${locName}`;
                    } catch (e) {
                        textEl.innerHTML = `<span style="color:var(--success);"><i class="fa-solid fa-satellite-dish fa-beat-fade"></i> Live Tracking...</span>`;
                    }
                }

                this.renderHomeRecommendations();
                if(document.getElementById('view-search-results').classList.contains('active')) this.renderSearchResults();
                if(document.getElementById('view-map').classList.contains('active')) this.updateMap();
            },
            (error) => {
                textEl.innerHTML = `<i class="fa-solid fa-satellite-dish"></i> Tracking disabled. Tap to allow.`;
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );
    },

    navigate(viewId) {
        document.querySelectorAll('.view').forEach(v => {
            if(v.id !== 'feedback-modal' && v.id !== 'radar-modal') {
                v.classList.remove('active');
            }
        });
        document.getElementById(`view-${viewId}`).classList.add('active');
        window.scrollTo(0,0);
        
        if (viewId === 'home') this.fetchServices();
        if (viewId === 'map') setTimeout(() => this.initMap(), 300);
        if (viewId === 'favorites') this.renderFavorites();
        if (viewId === 'provider-login' && this.loggedInProvider) {
            return this.navigate('provider-dashboard');
        }
        if (viewId === 'provider-dashboard') {
            if (!this.loggedInProvider) {
                this.showToast("Please sign in to access your Provider Dashboard.");
                return this.navigate('provider-login');
            }
            this.populateDashboard(this.loggedInProvider);
            this.loadProviderInquiries(this.loggedInProvider.id);
        }
    },

    initMap() {
        if (!mapInstance) {
            const center = this.currentLocation ? [this.currentLocation.lat, this.currentLocation.lng] : [18.52, 73.85];
            mapInstance = L.map('map').setView(center, 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(mapInstance);
            markersLayer = L.layerGroup().addTo(mapInstance);
        }
        this.updateMap();
    },

    updateMap() {
        if (!mapInstance || !markersLayer) return;
        markersLayer.clearLayers();

        if (this.currentLocation) {
            L.marker([this.currentLocation.lat, this.currentLocation.lng])
                .bindPopup("<b>You are here</b>").addTo(markersLayer);
            mapInstance.setView([this.currentLocation.lat, this.currentLocation.lng], 13);
        }

        let displayed = this.services;
        if (this.mapFilterActiveOnly) {
            displayed = displayed.filter(s => s.verified || s.rating >= 4.5);
        }

        displayed.forEach(s => {
            if(s.lat && s.lng) {
                const marker = L.marker([s.lat, s.lng]).addTo(markersLayer);
                marker.bindPopup(`
                    <div style="min-width:180px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <b style="font-size:1rem;">${s.name}</b>
                            <span style="color:var(--success); font-size:0.75rem;"><i class="fa-solid fa-bolt"></i> Live</span>
                        </div>
                        <div style="color:var(--warning); font-size:0.85rem; margin-bottom:4px;">★ ${Number(s.rating).toFixed(1)} &bull; ${s.trustScore || 96}% Trust</div>
                        <p style="margin:0 0 8px; font-size:0.8rem; color:var(--text-muted);">${s.menu || s.desc || ''}</p>
                        <div style="display:flex; gap:6px;">
                            <button onclick="app.viewDetails(${s.id})" style="flex:1; padding:4px 8px; font-size:0.75rem; cursor:pointer;">View</button>
                            <button onclick="app.openLiveChat(${s.id})" style="flex:1; padding:4px 8px; font-size:0.75rem; cursor:pointer; background:var(--primary); color:white; border:none; border-radius:4px;">Chat</button>
                        </div>
                    </div>
                `);
            }
        });
    },

    toggleMapActiveFilter() {
        this.mapFilterActiveOnly = !this.mapFilterActiveOnly;
        const btn = document.getElementById('map-filter-toggle');
        if (btn) {
            btn.innerHTML = this.mapFilterActiveOnly 
                ? '<i class="fa-solid fa-check" style="color:var(--success);"></i> Active Only' 
                : '<i class="fa-solid fa-bolt" style="color:var(--warning);"></i> Active Providers';
        }
        this.updateMap();
    },

    openCategory(category) {
        this.currentCategory = category;
        this.currentFoodFilter = 'any'; 
        const titleMap = { 'tiffin': 'Tiffins & Mess', 'laundry': 'Laundry Services', 'maid': 'Maids & Help', 'all': 'All Services' };
        document.getElementById('search-title').innerText = titleMap[category] || 'Services';
        document.getElementById('ai-analysis-box').style.display = 'none';

        const filtersContainer = document.getElementById('food-filters');
        if (category === 'tiffin') {
            filtersContainer.style.display = 'block';
            document.querySelectorAll('.radio-btn input').forEach(p => p.checked = (p.value === 'any'));
        } else filtersContainer.style.display = 'none';
        
        this.renderSearchResults();
        this.navigate('search-results');
    },

    setFoodFilter(val) {
        this.currentFoodFilter = val;
        this.renderSearchResults();
    },

    async performAISearch(query) {
        if (!query) return;
        try {
            const btn = document.getElementById('ai-submit-btn');
            const ogText = btn.innerHTML;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Analysing...`;
            
            const res = await fetch(`${API_URL}/ai-search`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query, userLat: this.currentLocation?.lat, userLng: this.currentLocation?.lng })
            });
            const data = await res.json();
            
            this.services = data.results;
            document.getElementById('search-title').innerHTML = `AI Results for <span style="color:var(--primary)">"${query}"</span>`;
            document.getElementById('food-filters').style.display = 'none';
            this.currentCategory = 'ai-search';

            if(data.analysis) {
                document.getElementById('ai-analysis-text').innerText = data.analysis;
                document.getElementById('ai-analysis-box').style.display = 'block';
            }

            this.renderSearchResults();
            this.navigate('search-results');
            btn.innerHTML = ogText;
        } catch (e) {
            console.error("AI Search Failed", e);
            alert("AI search failed. Please hard refresh.");
            document.getElementById('ai-submit-btn').innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Ask AI`;
        }
    },

    calculateDistance(lat2, lon2) {
        if(!this.currentLocation || !lat2 || !lon2) return null;
        const lat1 = this.currentLocation.lat;
        const lon1 = this.currentLocation.lng;
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;  
        const dLon = (lon2 - lon1) * Math.PI / 180; 
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2); 
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
        return (R * c).toFixed(1);
    },

    getProcessedServices() {
        let results = this.services;
        if (this.currentCategory !== 'all' && this.currentCategory !== 'ai-search') {
            results = results.filter(s => s.type === this.currentCategory);
        }
        if (this.currentCategory === 'tiffin' && this.currentFoodFilter !== 'any') {
            results = results.filter(s => s.foodPref === this.currentFoodFilter || s.foodPref === 'both');
        }
        let mapped = results.map(s => ({ ...s, dist: this.calculateDistance(s.lat, s.lng) }));

        if (this.currentCategory !== 'ai-search') {
            mapped.sort((a, b) => {
                if(a.dist !== null && b.dist !== null) return parseFloat(a.dist) - parseFloat(b.dist);
                return b.rating - a.rating;
            });
        }
        return mapped;
    },

    renderServiceCard(s) {
        let tagsHtml = '';
        if (s.type === 'tiffin') {
            if (s.foodPref === 'veg') tagsHtml += `<span class="tag veg"><i class="fa-solid fa-leaf"></i> Pure Veg</span>`;
            else if (s.foodPref === 'non-veg') tagsHtml += `<span class="tag non-veg" style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid rgba(239,68,68,0.3);"><i class="fa-solid fa-drumstick-bite"></i> Non-Veg Only</span>`;
            else if (s.foodPref === 'both') tagsHtml += `<span class="tag mixed" style="background:rgba(245,158,11,0.2); color:#fbbf24; border:1px solid rgba(245,158,11,0.3);"><i class="fa-solid fa-utensils"></i> Veg &amp; Non-Veg</span>`;
        }
        let locationLabel = s.location || 'India';
        let distHtml = s.dist !== null 
            ? `<span class="tag"><i class="fa-solid fa-location-dot"></i> ~${s.dist} km &bull; ${locationLabel}</span>` 
            : `<span class="tag"><i class="fa-solid fa-location-dot"></i> ${locationLabel}</span>`;
        let aiBadge = s.aiScore ? `<span class="tag ai"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Score: ${Math.round(s.aiScore)}</span>` : '';
        let verifiedBadge = s.verified ? `<span class="badge-verified"><i class="fa-solid fa-shield-check"></i> Verified</span>` : '';
        let trustBadge = `<span class="badge-trust"><i class="fa-solid fa-certificate"></i> ${s.trustScore || 96}% Trust</span>`;
        let imageHtml = s.image_url ? `<img src="http://localhost:3000${s.image_url}" style="width:100%; height:120px; object-fit:cover; border-radius:8px; margin-bottom:1rem;">` : '';
        
        const favs = this.getFavorites();
        const isFav = favs.includes(s.id);

        return `
            <div class="result-card" onclick="app.viewDetails(${s.id})">
                <button class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); app.toggleFavorite(${s.id});" title="${isFav ? 'Remove from Saved' : 'Save to Favorites'}">
                    <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                </button>
                ${imageHtml}
                <div class="result-header">
                    <div>
                        <h3 style="margin:0 0 4px;">${s.name}</h3>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            ${verifiedBadge}
                            ${trustBadge}
                        </div>
                    </div>
                    <div class="rating"><i class="fa-solid fa-star"></i> ${Number(s.rating).toFixed(1)}</div>
                </div>
                <div class="tags" style="margin-top:0.5rem;">${aiBadge}${tagsHtml}${distHtml}</div>
                <p style="font-size: 0.9rem; margin-bottom: 1rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${s.desc}</p>
                <div style="display:flex; gap:8px;">
                    <button class="btn-secondary" style="flex:1;" onclick="event.stopPropagation(); app.viewDetails(${s.id})">View Details <i class="fa-solid fa-arrow-right"></i></button>
                    <a href="tel:${s.contact}" class="btn-primary" style="padding:0.7rem 1.1rem; text-decoration:none; display:flex; align-items:center; gap:6px;" onclick="event.stopPropagation(); app.trackCall(${s.id})" title="Call Provider"><i class="fa-solid fa-phone"></i> Call</a>
                </div>
            </div>
        `;
    },

    renderHomeRecommendations() {
        const container = document.getElementById('home-recommendations');
        const countEl = document.getElementById('home-services-count');
        const titleEl = document.getElementById('home-section-title');
        if (titleEl) titleEl.innerText = "All Registered Services";

        let allServices = [...this.services]
            .map(s => ({ ...s, dist: this.calculateDistance(s.lat, s.lng) }))
            .sort((a,b) => {
                if(a.dist !== null && b.dist !== null) return parseFloat(a.dist) - parseFloat(b.dist);
                return (b.rating || 0) - (a.rating || 0);
            });
            
        if (countEl) {
            countEl.innerText = `${allServices.length} registered services across India`;
        }

        if(allServices.length === 0) {
            container.innerHTML = "<div class='skeleton'></div><div class='skeleton'></div><div class='skeleton'></div>";
            return;
        }
        container.innerHTML = allServices.map(s => this.renderServiceCard(s)).join('');
    },

    renderSearchResults() {
        const container = document.getElementById('results-list');
        const results = this.getProcessedServices();
        if (results.length === 0) {
            container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
                <h3><i class="fa-solid fa-ghost" style="font-size:2rem; color:var(--text-muted); margin-bottom:1rem; display:block;"></i>No services found.</h3>
                <button class="btn-primary" style="margin-top:1rem;" onclick="document.getElementById('radar-modal').style.display='flex'">Alert me when one opens</button>
            </div>`;
            return;
        }
        container.innerHTML = results.map(s => this.renderServiceCard(s)).join('');
    },

    viewDetails(id) {
        this.currentDetailId = id;
        const s = this.services.find(x => x.id === id);
        if(!s) return;
        
        // Track View
        fetch(`${API_URL}/services/${id}/track`, {
            method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type:'click'})
        });

        this.renderDetailContent(s);
        this.navigate('service-detail');
    },

    renderDetailContent(s) {
        const container = document.getElementById('detail-content');
        
        let tagsHtml = '';
        if (s.type === 'tiffin') {
            if(s.foodPref === 'veg') tagsHtml += `<span class="tag veg">Pure Veg</span> `;
            if(s.foodPref === 'non-veg') tagsHtml += `<span class="tag non-veg">Non-Veg</span> `;
            if(s.foodPref === 'both') tagsHtml += `<span class="tag veg">Veg</span> <span class="tag non-veg">Non-Veg</span> `;
        } else tagsHtml += `<span class="tag" style="background:var(--primary);">${s.type.toUpperCase()}</span>`;

        let dist = this.calculateDistance(s.lat, s.lng);
        let distHtml = dist !== null ? `<span class="tag"><i class="fa-solid fa-map-pin"></i> ${dist} km away</span>` : `<span class="tag"><i class="fa-solid fa-map-pin"></i> ${s.location}</span>`;

        let myReviews = [];
        try { myReviews = JSON.parse(localStorage.getItem('my_reviews')) || []; } catch(e){}

        let feedbackHtml = (s.feedbacks || []).map(f => {
            const isMine = myReviews.includes(f.id);
            const actionBtns = isMine ? `
                <div style="margin-top: 10px;">
                    <button class="btn-text" style="color:var(--warning); font-size:0.8rem; padding:0; margin-right:10px;" onclick="app.editReviewPrompt(${f.id}, \`${f.text.replace(/`/g, '')}\`, ${f.rating}, ${s.id})"><i class="fa-solid fa-pen"></i> Edit</button>
                    <button class="btn-text" style="color:#ef4444; font-size:0.8rem; padding:0;" onclick="app.deleteReview(${f.id}, ${s.id})"><i class="fa-solid fa-trash"></i> Delete</button>
                </div>
            ` : '';

            return `
            <div class="feedback-card">
                <div class="user">
                    <i class="fa-solid fa-circle-user"></i> ${f.user} 
                    <span style="color:var(--warning); margin-left:10px; font-size:0.8rem;">
                        ${Array(5).fill(0).map((_, i) => `<i class="fa-solid fa-star" style="color: ${i < f.rating ? 'var(--warning)' : 'var(--text-muted)'}"></i>`).join('')}
                    </span>
                </div>
                <p style="margin:0; font-size: 0.95rem; margin-top:5px;">"${f.text}"</p>
                ${actionBtns}
            </div>
        `}).join('');
        if(!s.feedbacks || s.feedbacks.length === 0) feedbackHtml = `<p>No reviews yet.</p>`;

        // Render Image Gallery
        let imagesHtml = '';
        if (s.imagesList && s.imagesList.length > 0) {
            imagesHtml = `<div style="display:flex; overflow-x:auto; gap:10px; margin-bottom:1.5rem; padding-bottom:10px; scroll-snap-type: x mandatory;">
                ${s.imagesList.map(url => `<img src="${url}" style="height:250px; min-width:300px; object-fit:cover; border-radius:12px; scroll-snap-align: center;">`).join('')}
            </div>`;
        }

        container.innerHTML = `
            ${imagesHtml}
            <div class="detail-header">
                <h1>${s.name}</h1>
                <div class="tags" style="margin-top: 1rem;">
                    <div class="rating"><i class="fa-solid fa-star"></i> ${Number(s.rating).toFixed(1)} (${s.reviews} reviews)</div>
                    ${tagsHtml}
                    ${distHtml}
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; margin-top: 2rem;">
                <div>
                    <h3>About the Service</h3>
                    <p>${s.desc}</p>
                    <div class="menu-box">
                        <h3><i class="fa-solid fa-list"></i> Highlights / Menu</h3>
                        <p style="margin-top: 0.5rem; color: var(--text-main); font-size:1.1rem; font-weight:600;">${s.menu}</p>
                    </div>

                    <div class="feedback-section">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                            <h3 style="margin:0;"><i class="fa-regular fa-comments"></i> Customer Feedback</h3>
                            <div>
                                <button class="btn-text" style="color:var(--secondary); margin-right:10px;" onclick="app.generateAISummary(${s.id})"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Summary</button>
                                <button class="btn-text" style="color:var(--primary);" onclick="app.openFeedbackModal()"><i class="fa-solid fa-pen"></i> Write Review</button>
                            </div>
                        </div>
                        <div id="ai-summary-box-${s.id}" class="card glass-card" style="display:none; background:rgba(99, 102, 241, 0.1); border:1px solid var(--primary); margin-bottom:1rem;">
                            <h4 style="color:var(--primary); margin-bottom:0.5rem;"><i class="fa-solid fa-bolt" style="color:var(--warning);"></i> Simply Live AI Summary</h4>
                            <p id="ai-summary-text-${s.id}" style="margin:0; font-size:0.95rem; line-height:1.5;">Generating...</p>
                        </div>
                        ${feedbackHtml}
                    </div>
                </div>

                <div>
                    <div class="glass-card" style="padding: 1.5rem; position: sticky; top: 100px;">
                        <h3 style="margin-bottom: 1rem;">Contact Provider</h3>
                        <p style="font-size: 0.9rem; margin-bottom: 1.5rem;">Connect directly with the service provider to inquire or order.</p>
                        <a href="tel:${s.contact}" onclick="app.trackCall(${s.id})" class="btn-primary btn-block" style="text-decoration:none; text-align:center; display:block; padding:15px; font-size:1.1rem; box-shadow: 0 0 20px rgba(99,102,241,0.4); margin-bottom:12px;">
                            <i class="fa-solid fa-phone fa-shake"></i> Call ${s.contact}
                        </a>
                        <button onclick="app.toggleLiveAIChat(); app.sendQuickPrompt('Tell me more about ' + encodeURIComponent('${s.name}'));" class="btn-secondary btn-block" style="display:flex; align-items:center; justify-content:center; gap:8px; padding:13px; font-size:1rem; border-color:var(--primary);">
                            <i class="fa-solid fa-wand-magic-sparkles" style="color:var(--primary);"></i> Ask Simply Live AI about this
                        </button>
                    </div>
                </div>
            </div>
        `;
        if(window.innerWidth <= 768) {
            const gridEl = container.querySelector('div[style*="grid-template-columns"]');
            if(gridEl) gridEl.style.gridTemplateColumns = '1fr';
        }
    },

    trackCall(id) {
        fetch(`${API_URL}/services/${id}/track`, {
            method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type:'call'})
        });
    },

    async generateAISummary(id) {
        document.getElementById(`ai-summary-box-${id}`).style.display = 'block';
        document.getElementById(`ai-summary-text-${id}`).innerText = "Simply Live AI is analyzing reviews in real-time...";
        try {
            const res = await fetch(`${API_URL}/services/${id}/ai-summary`);
            const data = await res.json();
            document.getElementById(`ai-summary-text-${id}`).innerText = data.summary;
        } catch(e) {
            document.getElementById(`ai-summary-text-${id}`).innerText = "Failed to generate AI summary.";
        }
    },

    toggleProviderFoodPref() {
        const type = document.getElementById('reg-type').value;
        const group = document.getElementById('reg-food-pref-group');
        group.style.display = type === 'tiffin' ? 'block' : 'none';
    },

    async registerService() {
        const form = document.getElementById('register-form');
        const formData = new FormData(form);

        // Location & Coordinates handling
        const locInput = document.getElementById('reg-location');
        const userEnteredLoc = locInput ? locInput.value.trim() : '';
        if (userEnteredLoc) {
            formData.set('location', userEnteredLoc);
        } else if (!formData.get('location')) {
            formData.set('location', 'Across India');
        }

        formData.set('lat', this.currentLocation?.lat || 19.0760);
        formData.set('lng', this.currentLocation?.lng || 72.8777);

        if (formData.get('type') !== 'tiffin') {
            formData.delete('foodPref');
        }

        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Registering Business...';
        btn.disabled = true;

        try {
            const res = await fetch(`${API_URL}/services`, { method: 'POST', body: formData });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Server error (${res.status})`);
            }
            const data = await res.json();
            if (!data.success) {
                throw new Error(data.error || "Failed to register service");
            }

            const providerObj = data.service || {
                id: data.id,
                name: formData.get('name'),
                type: formData.get('type'),
                foodPref: formData.get('foodPref'),
                location: formData.get('location'),
                desc: formData.get('desc'),
                menu: formData.get('menu'),
                contact: formData.get('contact'),
                pin: formData.get('pin'),
                rating: 5.0,
                reviews: 0,
                clicks: 0,
                calls: 0,
                trustScore: 98,
                verified: true
            };

            this.loggedInProvider = providerObj;
            localStorage.setItem('simply_live_provider', JSON.stringify(providerObj));
            this.updateNavProviderStatus();

            form.reset();
            await this.fetchServices();

            if (this.socket) this.socket.emit('join_room', providerObj.id);
            this.populateDashboard(providerObj);
            this.loadProviderInquiries(providerObj.id);

            this.navigate('provider-dashboard');
            this.showToast(`🎉 Registration Successful! Welcome, ${providerObj.name}. Service ID is #${providerObj.id}.`);
        } catch (e) {
            console.error("Error registering service:", e);
            alert("Registration failed: " + e.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    restoreProviderSession() {
        try {
            const saved = localStorage.getItem('simply_live_provider');
            if (saved) {
                this.loggedInProvider = JSON.parse(saved);
                this.updateNavProviderStatus();
                if (this.socket && this.loggedInProvider.id) {
                    this.socket.emit('join_room', this.loggedInProvider.id);
                }
            }
        } catch (e) {
            console.warn("Failed to restore provider session:", e);
        }
    },

    updateNavProviderStatus() {
        const btn = document.getElementById('nav-provider-btn');
        if (!btn) return;
        if (this.loggedInProvider) {
            const shortName = this.loggedInProvider.name.length > 14 
                ? this.loggedInProvider.name.substring(0, 12) + '...' 
                : this.loggedInProvider.name;
            btn.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--success);"></i> <span class="nav-btn-text">${this.escapeHtml(shortName)}</span>`;
            btn.title = "Go to Provider Dashboard";
            btn.onclick = () => this.navigate('provider-dashboard');
        } else {
            btn.innerHTML = `<i class="fa-solid fa-user-tie"></i> <span class="nav-btn-text">Provider Portal</span>`;
            btn.title = "Provider Portal Login";
            btn.onclick = () => this.navigate('provider-login');
        }
    },

    async providerLogin() {
        const idInput = document.getElementById('login-id');
        const pinInput = document.getElementById('login-pin');
        const btn = document.getElementById('login-submit-btn') || document.querySelector('#view-provider-login button[type="submit"]');
        const originalText = btn ? btn.innerHTML : '';

        const id = idInput ? idInput.value.trim() : '';
        const pin = pinInput ? pinInput.value.trim() : '';

        if (!id || !pin) {
            alert("Please enter your Service ID / Registered Phone and 4-digit PIN.");
            return;
        }

        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Signing in...';
            btn.disabled = true;
        }

        try {
            const res = await fetch(`${API_URL}/provider/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, pin })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(data.error || "Invalid Service ID/Phone or PIN!");
            }

            this.loggedInProvider = data.service;
            localStorage.setItem('simply_live_provider', JSON.stringify(data.service));
            this.updateNavProviderStatus();

            this.populateDashboard(data.service);
            if (this.socket) this.socket.emit('join_room', data.service.id);
            this.loadProviderInquiries(data.service.id);

            this.navigate('provider-dashboard');
            this.showToast(`Welcome back, ${data.service.name}!`);
        } catch (e) {
            alert(e.message || "Invalid Service ID or PIN!");
        } finally {
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
    },

    populateDashboard(s) {
        if (!s) return;
        const idEl = document.getElementById('dash-id');
        const nameEl = document.getElementById('dash-name');
        const scoreEl = document.getElementById('dash-trust-score');
        const viewsEl = document.getElementById('dash-views');
        const callsEl = document.getElementById('dash-calls');
        const menuEl = document.getElementById('dash-menu');

        if (idEl) idEl.innerText = s.id || '--';
        if (nameEl) nameEl.innerText = s.name || 'Your Service';
        if (scoreEl) scoreEl.innerText = (s.trustScore || 98) + '%';
        if (viewsEl) viewsEl.innerText = s.clicks || 0;
        if (callsEl) callsEl.innerText = s.calls || 0;
        if (menuEl) menuEl.value = s.menu || '';
    },

    async loadProviderInquiries(serviceId) {
        const feed = document.getElementById('provider-inquiries-feed');
        const chatsCountEl = document.getElementById('dash-chats');
        if (!feed) return;

        try {
            const res = await fetch(`${API_URL}/provider/${serviceId}/inquiries`);
            if (!res.ok) throw new Error("Failed to load inquiries");
            const inquiries = await res.json();

            if (chatsCountEl) chatsCountEl.innerText = inquiries.length || 0;

            if (!inquiries || inquiries.length === 0) {
                feed.innerHTML = `
                    <div style="text-align:center; padding: 2rem 1rem; color:var(--text-muted);">
                        <i class="fa-regular fa-comment-dots" style="font-size:2rem; margin-bottom:0.75rem; display:block; opacity:0.6;"></i>
                        <p style="margin:0; font-size:0.95rem;">No customer inquiries yet.</p>
                        <p style="margin:4px 0 0; font-size:0.8rem;">When customers message your service or ask about your menu, messages will appear here in real time.</p>
                    </div>
                `;
                return;
            }

            feed.innerHTML = inquiries.map(m => {
                const isProvider = m.role === 'provider';
                const timeStr = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live';
                return `
                    <div class="chat-bubble ${isProvider ? 'provider' : 'customer'}" style="margin-bottom:0.75rem; padding:12px 14px; border-radius:12px; background: ${isProvider ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.06)'}; border: 1px solid ${isProvider ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.1)'};">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:0.8rem;">
                            <strong style="color: ${isProvider ? 'var(--primary)' : 'var(--secondary)'};">
                                <i class="fa-solid ${isProvider ? 'fa-user-tie' : 'fa-circle-user'}"></i> ${this.escapeHtml(m.sender || (isProvider ? 'You (Provider)' : 'Customer'))}
                            </strong>
                            <span style="color:var(--text-muted); font-size:0.75rem;">${timeStr}</span>
                        </div>
                        <div style="font-size:0.92rem; color:var(--text-main); line-height:1.4;">${this.escapeHtml(m.text)}</div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.error("Error loading provider inquiries:", e);
        }
    },

    async providerSendReply() {
        if (!this.loggedInProvider) return;
        const input = document.getElementById('provider-reply-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        try {
            const res = await fetch(`${API_URL}/services/${this.loggedInProvider.id}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender: this.loggedInProvider.name,
                    role: 'provider',
                    text
                })
            });
            if (!res.ok) throw new Error("Failed to send message");
            this.showToast("Reply sent to customer!");
            this.loadProviderInquiries(this.loggedInProvider.id);
        } catch (e) {
            console.error("Error sending provider reply:", e);
            alert("Could not send reply. Please try again.");
        }
    },

    handleIncomingMessage(msg) {
        if (this.loggedInProvider && msg.service_id === this.loggedInProvider.id) {
            this.loadProviderInquiries(this.loggedInProvider.id);
            if (msg.role !== 'provider') {
                this.showToast(`💬 New Inquiry from ${msg.sender}: "${msg.text.slice(0, 35)}..."`);
            }
        }
    },

    providerLogout() {
        this.loggedInProvider = null;
        localStorage.removeItem('simply_live_provider');
        this.updateNavProviderStatus();
        this.navigate('home');
        this.showToast("Logged out of Provider Portal");
    },

    async updateProviderMenu() {
        if (!this.loggedInProvider) return;
        const menuInput = document.getElementById('dash-menu');
        const menu = menuInput ? menuInput.value.trim() : '';
        try {
            const res = await fetch(`${API_URL}/provider/update-menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: this.loggedInProvider.id,
                    pin: this.loggedInProvider.pin,
                    menu
                })
            });
            if (!res.ok) throw new Error("Failed to update menu");
            this.loggedInProvider.menu = menu;
            localStorage.setItem('simply_live_provider', JSON.stringify(this.loggedInProvider));
            this.showToast("Menu / Pricing updated successfully!");
            this.fetchServices();
        } catch (e) {
            alert("Failed to update menu: " + e.message);
        }
    },

    async subscribeRadar() {
        const email = document.getElementById('radar-email').value;
        if(!email) return;
        try {
            await fetch(`${API_URL}/radar/subscribe`, {
                method: 'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({lat: this.currentLocation?.lat, lng: this.currentLocation?.lng, category: this.currentCategory, email})
            });
            document.getElementById('radar-modal').style.display = 'none';
            this.showToast("Radar Active! We'll email you when a service opens near you.");
        } catch(e) {
            alert("Failed to activate radar.");
        }
    },

    initStarRating() {
        const stars = document.querySelectorAll('#star-rating-input i');
        stars.forEach(star => {
            star.addEventListener('click', (e) => {
                this.selectedStarRating = parseInt(e.target.getAttribute('data-val'));
                stars.forEach(s => {
                    if(parseInt(s.getAttribute('data-val')) <= this.selectedStarRating) {
                        s.classList.add('active');
                        s.style.color = 'var(--warning)';
                    } else {
                        s.classList.remove('active');
                        s.style.color = 'var(--text-muted)';
                    }
                });
            });
        });
    },

    openFeedbackModal() { document.getElementById('feedback-modal').style.display = 'flex'; },
    closeFeedbackModal() { 
        document.getElementById('feedback-modal').style.display = 'none'; 
        document.getElementById('review-text').value = '';
        delete this.editingReviewId;
    },

    editReviewPrompt(reviewId, text, rating, serviceId) {
        this.editingReviewId = reviewId;
        document.getElementById('review-text').value = text;
        const stars = document.querySelectorAll('#star-rating-input i');
        this.selectedStarRating = rating;
        stars.forEach(s => {
            if(parseInt(s.getAttribute('data-val')) <= rating) {
                s.classList.add('active');
                s.style.color = 'var(--warning)';
            } else {
                s.classList.remove('active');
                s.style.color = 'var(--text-muted)';
            }
        });
        this.openFeedbackModal();
    },

    async deleteReview(reviewId, serviceId) {
        if(!confirm("Are you sure you want to delete this review?")) return;
        try {
            await fetch(`${API_URL}/services/${serviceId}/reviews/${reviewId}`, { method: 'DELETE' });
            let myReviews = JSON.parse(localStorage.getItem('my_reviews')) || [];
            myReviews = myReviews.filter(id => id !== reviewId);
            localStorage.setItem('my_reviews', JSON.stringify(myReviews));
            
            this.showToast("Review deleted.");
            await this.fetchServices();
            this.viewDetails(this.currentDetailId);
        } catch(e) { alert("Failed to delete review."); }
    },

    async submitReview() {
        const name = document.getElementById('review-name').value.trim() || 'Anonymous User';
        const text = document.getElementById('review-text').value.trim();
        if(!text) { alert('Please write something.'); return; }

        try {
            if (this.editingReviewId) {
                // Edit existing review
                await fetch(`${API_URL}/services/${this.currentDetailId}/reviews/${this.editingReviewId}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, rating: this.selectedStarRating })
                });
                this.showToast("Review updated successfully!");
            } else {
                // Create new review
                const res = await fetch(`${API_URL}/services/${this.currentDetailId}/reviews`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user: name, text, rating: this.selectedStarRating })
                });
                const data = await res.json();
                
                let myReviews = [];
                try { myReviews = JSON.parse(localStorage.getItem('my_reviews')) || []; } catch(e){}
                myReviews.push(data.review_id);
                localStorage.setItem('my_reviews', JSON.stringify(myReviews));
                this.showToast("Review submitted successfully!");
            }

            this.closeFeedbackModal();
            await this.fetchServices(); 
            this.viewDetails(this.currentDetailId); 
        } catch (e) { alert("Error submitting review."); }
    },

    startVoiceSearch() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert("Voice search is not supported in this browser.");
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        
        const btn = document.getElementById('voice-btn');
        btn.classList.add('listening');
        btn.innerHTML = '<i class="fa-solid fa-microphone-lines fa-fade"></i>';

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            document.getElementById('ai-search-input').value = transcript;
            this.performAISearch(transcript);
        };
        recognition.onerror = () => this.showToast("Voice search failed.");
        recognition.onend = () => {
            btn.classList.remove('listening');
            btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        };
        recognition.start();
    },

    // --- FAVORITES & BOOKMARKS ---
    getFavorites() {
        try {
            return JSON.parse(localStorage.getItem('my_favorites')) || [];
        } catch(e) {
            return [];
        }
    },

    toggleFavorite(id) {
        let favs = this.getFavorites();
        const index = favs.indexOf(id);
        if (index > -1) {
            favs.splice(index, 1);
            this.showToast("Removed from saved favorites");
        } else {
            favs.push(id);
            this.showToast("Saved to favorites ❤️");
        }
        localStorage.setItem('my_favorites', JSON.stringify(favs));
        this.updateFavoritesCount();

        if (document.getElementById('view-favorites').classList.contains('active')) {
            this.renderFavorites();
        } else {
            this.renderHomeRecommendations();
            if (document.getElementById('view-search-results').classList.contains('active')) {
                this.renderSearchResults();
            }
        }
    },

    updateFavoritesCount() {
        const count = this.getFavorites().length;
        const countEl = document.getElementById('fav-count');
        if (countEl) countEl.innerText = count;
        const totalText = document.getElementById('fav-total-text');
        if (totalText) totalText.innerText = `${count} saved service${count === 1 ? '' : 's'}`;
    },

    renderFavorites() {
        const container = document.getElementById('favorites-list');
        const favIds = this.getFavorites();
        const favServices = this.services.filter(s => favIds.includes(s.id));

        if (favServices.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
                    <i class="fa-regular fa-heart" style="font-size:3rem; color:var(--text-muted); margin-bottom:1rem; display:block;"></i>
                    <h3>No saved services yet</h3>
                    <p>Click the heart icon on any service card to bookmark it for quick access!</p>
                    <button class="btn-primary" style="margin-top:1rem;" onclick="app.navigate('home')">Explore Services</button>
                </div>
            `;
            return;
        }

        container.innerHTML = favServices.map(s => this.renderServiceCard(s)).join('');
    },

    // --- CATEGORY PILLS ---
    filterHomeCategory(cat) {
        document.querySelectorAll('.pill-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`pill-${cat}`);
        if (activeBtn) activeBtn.classList.add('active');

        const titleEl = document.getElementById('home-section-title');
        const titleMap = {
            'all': 'All Registered Services',
            'tiffin': 'Registered Tiffins & Mess Services',
            'laundry': 'Registered Laundry Services',
            'maid': 'Registered Housekeeping & Maids',
            'verified': 'Verified Partner Services'
        };
        if (titleEl) titleEl.innerText = titleMap[cat] || 'All Registered Services';

        const container = document.getElementById('home-recommendations');
        let filtered = [...this.services].map(s => ({ ...s, dist: this.calculateDistance(s.lat, s.lng) }));

        if (cat === 'verified') {
            filtered = filtered.filter(s => s.verified);
        } else if (cat !== 'all') {
            filtered = filtered.filter(s => s.type === cat);
        }

        filtered.sort((a,b) => {
            if(a.dist !== null && b.dist !== null) return parseFloat(a.dist) - parseFloat(b.dist);
            return (b.rating || 0) - (a.rating || 0);
        });

        const countEl = document.getElementById('home-services-count');
        if (countEl) countEl.innerText = `${filtered.length} registered services`;

        if (filtered.length === 0) {
            container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color:var(--text-muted);">No services found in this category.</div>`;
            return;
        }

        container.innerHTML = filtered.map(s => this.renderServiceCard(s)).join('');
    },

    // --- SIMPLY LIVE WEBSITE REAL-TIME AI LIVE CHAT ---
    toggleLiveAIChat() {
        const win = document.getElementById('simply-live-chat-window');
        if (!win) return;
        win.classList.toggle('open');
        if (win.classList.contains('open')) {
            this.updateChatTicker();
            setTimeout(() => {
                const input = document.getElementById('live-chat-input');
                if (input) input.focus();
            }, 200);
        }
    },

    updateChatTicker() {
        const ticker = document.getElementById('chat-ticker-text');
        if (ticker) {
            const count = this.services.length;
            ticker.innerText = `Live Sync: ${count} verified local providers available right now`;
        }
    },

    sendQuickPrompt(text) {
        const input = document.getElementById('live-chat-input');
        if (input) input.value = text;
        const win = document.getElementById('simply-live-chat-window');
        if (win && !win.classList.contains('open')) {
            win.classList.add('open');
        }
        this.sendLiveChatMessage();
    },

    clearLiveChatHistory() {
        this.liveChatHistory = [];
        const msgContainer = document.getElementById('live-chat-messages');
        if (!msgContainer) return;
        msgContainer.innerHTML = `
            <div class="chat-msg bot">
                <div class="msg-avatar"><i class="fa-solid fa-bolt"></i></div>
                <div class="msg-content">
                    <div class="msg-bubble">
                        Conversation reset! How can I assist you with real-time local services today?
                    </div>
                </div>
            </div>
        `;
        this.showToast("Chat reset");
    },

    async sendLiveChatMessage() {
        const input = document.getElementById('live-chat-input');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        const msgContainer = document.getElementById('live-chat-messages');
        const indicator = document.getElementById('chat-typing-indicator');

        // Track multi-turn conversation history
        if (!this.liveChatHistory) this.liveChatHistory = [];
        this.liveChatHistory.push({ role: 'user', content: text });

        // 1. Append User Message
        const userDiv = document.createElement('div');
        userDiv.className = 'chat-msg user';
        userDiv.innerHTML = `
            <div class="msg-content">
                <div class="msg-bubble">${this.escapeHtml(text)}</div>
            </div>
        `;
        msgContainer.appendChild(userDiv);
        msgContainer.scrollTop = msgContainer.scrollHeight;

        // 2. Show Scanning Indicator
        if (indicator) indicator.style.display = 'flex';
        msgContainer.scrollTop = msgContainer.scrollHeight;

        try {
            const res = await fetch(`${API_URL}/live-ai-chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    history: this.liveChatHistory.slice(-8),
                    userLat: this.currentLocation?.lat,
                    userLng: this.currentLocation?.lng
                })
            });
            const data = await res.json();

            // Record assistant turn in conversation history
            this.liveChatHistory.push({
                role: 'assistant',
                content: data.reply,
                context: data.context || {}
            });

            // 3. Render recommendations if any (STRICT: only when explicitly asked)
            let recsHtml = '';
            if (data.recommendations && data.recommendations.length > 0) {
                recsHtml = `<div class="chat-recommendations-grid">` + data.recommendations.map(s => {
                    const distTag = s.dist ? `<span class="chat-rec-tag"><i class="fa-solid fa-location-dot"></i> ~${s.dist} km</span>` : '';
                    const trustTag = `<span class="chat-rec-tag trust"><i class="fa-solid fa-shield-check"></i> ${s.trustScore || 96}% Trust</span>`;
                    let foodTag = '';
                    if (s.type === 'tiffin') {
                        if (s.foodPref === 'veg') foodTag = '<span class="chat-rec-tag veg"><i class="fa-solid fa-leaf"></i> 100% Pure Veg</span>';
                        else if (s.foodPref === 'non-veg') foodTag = '<span class="chat-rec-tag non-veg"><i class="fa-solid fa-drumstick-bite"></i> Non-Veg Specialist</span>';
                        else if (s.foodPref === 'both') foodTag = '<span class="chat-rec-tag mixed"><i class="fa-solid fa-utensils"></i> Veg &amp; Non-Veg</span>';
                    } else {
                        foodTag = `<span class="chat-rec-tag">${s.type.toUpperCase()}</span>`;
                    }

                    return `
                        <div class="chat-rec-card">
                            <div class="chat-rec-header">
                                <div>
                                    <h4 class="chat-rec-title">${this.escapeHtml(s.name)}</h4>
                                    <div class="chat-rec-tags">${foodTag} ${trustTag} ${distTag}</div>
                                </div>
                                <div class="chat-rec-rating"><i class="fa-solid fa-star"></i> ${Number(s.rating).toFixed(1)}</div>
                            </div>
                            <p class="chat-rec-desc">${this.escapeHtml(s.menu || s.desc || '')}</p>
                            <div class="chat-rec-actions">
                                <button class="btn-primary chat-rec-btn" onclick="app.viewDetails(${s.id})">
                                    <i class="fa-solid fa-eye"></i> View Profile
                                </button>
                                <a href="tel:${s.contact}" class="btn-secondary chat-rec-btn" onclick="app.trackCall(${s.id})">
                                    <i class="fa-solid fa-phone"></i> Call Provider
                                </a>
                            </div>
                        </div>
                    `;
                }).join('') + `</div>`;
            }

            // 4. Render interactive smart suggestions
            let suggestionsHtml = '';
            if (data.suggestions && data.suggestions.length > 0) {
                suggestionsHtml = `
                    <div class="chat-smart-suggestions">
                        ${data.suggestions.map(sug => {
                            const cleanQuery = sug.replace(/^💡\s*/, '').replace(/^(?:Ask|Say|Try asking):\s*/i, '').replace(/^['"]|['"]$/g, '').trim();
                            return `<div class="suggestion-item clickable" data-prompt="${this.escapeHtml(cleanQuery)}" onclick="app.sendQuickPrompt(this.getAttribute('data-prompt'))">${this.escapeHtml(sug)}</div>`;
                        }).join('')}
                    </div>
                `;
            }

            // 5. Append AI Bot Message
            if (indicator) indicator.style.display = 'none';

            const botDiv = document.createElement('div');
            botDiv.className = 'chat-msg bot';
            botDiv.innerHTML = `
                <div class="msg-avatar"><i class="fa-solid fa-bolt"></i></div>
                <div class="msg-content">
                    <div class="msg-bubble">
                        ${this.formatMarkdown(data.reply)}
                        ${suggestionsHtml}
                        ${recsHtml}
                    </div>
                </div>
            `;
            msgContainer.appendChild(botDiv);
            msgContainer.scrollTop = msgContainer.scrollHeight;

        } catch (e) {
            console.error("Live AI Chat error", e);
            if (indicator) indicator.style.display = 'none';

            const errDiv = document.createElement('div');
            errDiv.className = 'chat-msg bot';
            errDiv.innerHTML = `
                <div class="msg-avatar"><i class="fa-solid fa-bolt"></i></div>
                <div class="msg-content">
                    <div class="msg-bubble" style="color:#ef4444;">
                        Sorry, I encountered a temporary connection issue scanning live services. Please try again!
                    </div>
                </div>
            `;
            msgContainer.appendChild(errDiv);
            msgContainer.scrollTop = msgContainer.scrollHeight;
        }
    },

    startLiveChatVoice() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert("Voice recognition is not supported in this browser.");
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        const btn = document.getElementById('chat-voice-btn');
        if (btn) btn.classList.add('listening');

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            const input = document.getElementById('live-chat-input');
            if (input) input.value = transcript;
            this.sendLiveChatMessage();
        };
        recognition.onend = () => {
            if (btn) btn.classList.remove('listening');
        };
        recognition.start();
    },

    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    },

    formatMarkdown(text) {
        if (!text) return '';
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
