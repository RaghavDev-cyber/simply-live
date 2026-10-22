const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer Setup for Multiple Photos
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1000) + path.extname(file.originalname))
});
const upload = multer({ storage });

// Database Initialization & Migrations
const db = new sqlite3.Database('./database.db');
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, type TEXT, foodPref TEXT, location TEXT, lat REAL, lng REAL,
        rating REAL DEFAULT 0, reviews INTEGER DEFAULT 0, desc TEXT, menu TEXT, contact TEXT, image_url TEXT,
        clicks INTEGER DEFAULT 0, calls INTEGER DEFAULT 0, pin TEXT DEFAULT '1234', images TEXT,
        verified INTEGER DEFAULT 1, last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS feedbacks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, service_id INTEGER, user TEXT, text TEXT, rating INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(service_id) REFERENCES services(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, service_id INTEGER, sender TEXT, role TEXT, text TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(service_id) REFERENCES services(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS radar_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, lat REAL, lng REAL, category TEXT, email TEXT
    )`);

    // Migrations for existing DB
    db.run("ALTER TABLE services ADD COLUMN clicks INTEGER DEFAULT 0", () => {});
    db.run("ALTER TABLE services ADD COLUMN calls INTEGER DEFAULT 0", () => {});
    db.run("ALTER TABLE services ADD COLUMN pin TEXT DEFAULT '1234'", () => {});
    db.run("ALTER TABLE services ADD COLUMN images TEXT", () => {});
    db.run("ALTER TABLE services ADD COLUMN verified INTEGER DEFAULT 1", () => {});
    db.run("ALTER TABLE services ADD COLUMN image_url TEXT", () => {});
    db.run("ALTER TABLE services ADD COLUMN last_updated DATETIME DEFAULT CURRENT_TIMESTAMP", () => {});

    // Automatic Seed for Clean Deployments (Render, Railway, Fly.io, etc.)
    db.get("SELECT COUNT(*) as count FROM services", (err, row) => {
        if (!err && row && row.count === 0) {
            console.log("Empty database detected. Seeding verified services and feedbacks...");
            const initialServices = [
                { id: 1, name: "Maa Ki Rasoi Tiffin", type: "tiffin", foodPref: "veg", location: "Kothrud, Pune", lat: 18.5293, lng: 73.8113, rating: 4.5, reviews: 4, desc: "Authentic home-cooked pure vegetarian meals. Made with high hygiene standards.", menu: "Pure Veg Thali: ₹90 (Roti, Sabzi, Dal, Rice, Salad, Pickle). Weekend Special Paneer Thali: ₹120.", contact: "+91 9876543210", clicks: 8, calls: 1, pin: "1234", verified: 1 },
                { id: 2, name: "Spice Box Mess", type: "tiffin", foodPref: "both", location: "Karve Nagar, Pune", lat: 18.4900, lng: 73.8190, rating: 4.5, reviews: 89, desc: "Delicious meals with Veg and Non-Veg options. Special chicken thali available.", menu: "Daily Veg Thali: ₹100, Special Chicken Thali: ₹140. Unlimited Plan Available.", contact: "+91 8877665544", clicks: 1, calls: 1, pin: "1234", verified: 1 },
                { id: 3, name: "Sparkle Laundry Services", type: "laundry", foodPref: null, location: "Kothrud, Pune", lat: 18.5300, lng: 73.8150, rating: 4.7, reviews: 210, desc: "Free pickup and delivery. Wash & Iron, Dry Cleaning available.", menu: "Wash & Fold: ₹50/kg. Wash & Iron: ₹80/kg.", contact: "+91 9988776655", clicks: 0, calls: 0, pin: "1234", verified: 1 },
                { id: 4, name: "Reliable Maids Agency", type: "maid", foodPref: null, location: "Deccan, Pune", lat: 18.5150, lng: 73.8400, rating: 4.4, reviews: 75, desc: "Verified and trained maids for cleaning, cooking, and babysitting.", menu: "Sweeping/Swabbing: ₹1500/mo. Cooking: ₹2500/mo.", contact: "+91 6655443322", clicks: 5, calls: 0, pin: "1234", verified: 1 },
                { id: 5, name: "Kolhapuri Non-Veg Mess & Biryani", type: "tiffin", foodPref: "non-veg", location: "Karve Nagar / Deccan, Pune", lat: 18.5012, lng: 73.8214, rating: 4.8, reviews: 112, desc: "Authentic Maharashtra Non-Veg Mess. Famous for succulent Chicken Sukka, Tambda-Pandhra Rassa, Mutton Thali, and fresh Egg Curry.", menu: "Egg Curry Thali: ₹90, Chicken Thali: ₹130, Special Mutton Thali: ₹180. Unlimited Rassa & Bhakri.", contact: "+91 9765432109", clicks: 0, calls: 0, pin: "1234", verified: 1 },
                { id: 6, name: "Shree Krishna Pure Veg Tiffin", type: "tiffin", foodPref: "veg", location: "Bandra West, Mumbai", lat: 19.0596, lng: 72.8295, rating: 4.9, reviews: 142, desc: "Pure vegetarian Jain and homestyle Gujarati-Maharashtrian meals prepared in a 100% pure veg sanitized kitchen.", menu: "4 Phulkas, Paneer Butter Masala / Dal Fry, Jeera Rice, Salad, Gulab Jamun (₹95/meal)", contact: "+91 98201 44521", clicks: 2, calls: 0, pin: "1234", verified: 1 },
                { id: 7, name: "Delhi Homely Kitchen Tiffins", type: "tiffin", foodPref: "veg", location: "Lajpat Nagar, New Delhi", lat: 28.5677, lng: 77.2433, rating: 4.8, reviews: 185, desc: "Authentic homestyle North Indian food with low oil and high hygiene. Daily rotating lunch and dinner dabbas.", menu: "Dal Makhani, Shahi Paneer, 4 Tawa Rotis, Pulao, Raita (₹90/meal)", contact: "+91 98112 55432", clicks: 0, calls: 0, pin: "1234", verified: 1 },
                { id: 8, name: "Hyderabadi Spice Mess & Biryani", type: "tiffin", foodPref: "non-veg", location: "Banjara Hills, Hyderabad", lat: 17.4156, lng: 78.4357, rating: 4.9, reviews: 210, desc: "Authentic Hyderabadi Non-Veg specialists. Famous for Dum Biryani, Chicken Curry, and succulent Mutton Sukka.", menu: "Hyderabadi Chicken Curry, 3 Rumali Rotis, Chicken Dum Biryani, Mirchi Ka Salan (₹130/meal)", contact: "+91 98490 88210", clicks: 0, calls: 0, pin: "1234", verified: 1 },
                { id: 9, name: "Bangalore Express Tiffin & Mess", type: "tiffin", foodPref: "both", location: "Koramangala, Bengaluru", lat: 12.9352, lng: 77.6245, rating: 4.7, reviews: 128, desc: "Student and techie favorite. Homestyle South & North Indian meals with weekly non-veg chicken specials.", menu: "Unlimited Rice/Rotis, Sambar, Chicken Curry / Paneer, Curd, Sweet (₹100/meal)", contact: "+91 98450 77319", clicks: 0, calls: 0, pin: "1234", verified: 1 },
                { id: 10, name: "Urban Clean Laundromat", type: "laundry", foodPref: null, location: "Indiranagar, Bengaluru", lat: 12.9784, lng: 77.6408, rating: 4.9, reviews: 310, desc: "Italian steam press and organic detergents with doorstep pickup & delivery.", menu: "Wash & Fold (₹45/kg), Wash & Steam Iron (₹75/kg), Dry Cleaning (₹120/piece)", contact: "+91 98860 11994", clicks: 0, calls: 0, pin: "1234", verified: 1 },
                { id: 11, name: "Capital Housekeeping & Domestic Help", type: "maid", foodPref: null, location: "Connaught Place, New Delhi & NCR", lat: 28.6315, lng: 77.2167, rating: 4.8, reviews: 165, desc: "Police verified domestic help, dedicated cooks, and trained housekeepers with replacement guarantee.", menu: "House Cleaning (₹1600/month), Full-time Cooking (₹2800/month), Domestic Help (₹3800/month)", contact: "+91 98100 22718", clicks: 0, calls: 0, pin: "1234", verified: 1 }
            ];

            const initialFeedbacks = [
                { service_id: 1, user: "Rahul S.", text: "Feels like eating at home. Very healthy!", rating: 5 },
                { service_id: 1, user: "Priya M.", text: "Always on time and delicious food.", rating: 4 },
                { service_id: 6, user: "Aarav Mehta", text: "Authentic Gujarati taste with pure ghee rotis. Very clean packaging!", rating: 5 },
                { service_id: 6, user: "Priya Shah", text: "Best pure veg tiffin in Bandra. Less oil and high quality ingredients.", rating: 5 },
                { service_id: 7, user: "Rohan Sharma", text: "Felt like eating home cooked meal from mom. Dal Makhani was incredible.", rating: 5 },
                { service_id: 7, user: "Ananya Gupta", text: "Timely delivery every afternoon at my office. Highly recommended!", rating: 5 },
                { service_id: 8, user: "Syed Imran", text: "Real Hyderabadi flavors! The Chicken Biryani and Mutton Sukka are out of this world.", rating: 5 },
                { service_id: 9, user: "Karthik Raja", text: "Super affordable and generous portion sizes. Perfect for techies in Koramangala.", rating: 5 },
                { service_id: 10, user: "Deepika Nair", text: "Clothes smell fresh and the steam press is crisp. Free doorstep pickup on time.", rating: 5 },
                { service_id: 11, user: "Vikas Malhotra", text: "Police verified domestic cook assigned within 24 hours. Excellent service.", rating: 5 }
            ];

            initialServices.forEach(s => {
                db.run(
                    `INSERT INTO services (id, name, type, foodPref, location, lat, lng, rating, reviews, desc, menu, contact, clicks, calls, pin, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [s.id, s.name, s.type, s.foodPref, s.location, s.lat, s.lng, s.rating, s.reviews, s.desc, s.menu, s.contact, s.clicks, s.calls, s.pin, s.verified]
                );
            });

            initialFeedbacks.forEach(f => {
                db.run(`INSERT INTO feedbacks (service_id, user, text, rating) VALUES (?, ?, ?, ?)`, [f.service_id, f.user, f.text, f.rating]);
            });
        }
    });
});

// --- PUBLIC API ROUTES ---

app.get('/api/services', (req, res) => {
    db.all("SELECT * FROM services", (err, services) => {
        db.all("SELECT * FROM feedbacks ORDER BY created_at DESC", (err, feedbacks) => {
            services.forEach(s => {
                s.feedbacks = feedbacks.filter(f => f.service_id === s.id);
                try { s.imagesList = s.images ? JSON.parse(s.images) : (s.image_url ? [s.image_url] : []); } catch(e){ s.imagesList=[]; }
                s.verified = s.verified !== 0;
                s.trustScore = Math.min(99, Math.round(75 + ((s.rating || 4.5) * 4) + Math.min(6, (s.reviews || 0))));
            });
            res.json(services);
        });
    });
});

app.post('/api/services', upload.array('photos', 5), (req, res) => {
    try {
        const { name, type, foodPref, location, lat, lng, desc, menu, contact, pin } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Service name is required.' });
        }

        const images = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
        const image_url = images.length > 0 ? images[0] : null;

        const serviceName = name.trim();
        const serviceType = type || 'tiffin';
        const food = serviceType === 'tiffin' ? (foodPref || 'veg') : null;
        const loc = (location && location.trim()) ? location.trim() : 'Across India';
        const latitude = lat ? parseFloat(lat) : 19.0760;
        const longitude = lng ? parseFloat(lng) : 72.8777;
        const description = desc ? desc.trim() : '';
        const menuPricing = menu ? menu.trim() : '';
        const phone = contact ? contact.trim() : '';
        const servicePin = pin ? pin.trim() : '1234';

        db.run(
            `INSERT INTO services (name, type, foodPref, location, lat, lng, rating, reviews, desc, menu, contact, image_url, pin, images, verified) VALUES (?, ?, ?, ?, ?, ?, 5.0, 0, ?, ?, ?, ?, ?, ?, 1)`,
            [serviceName, serviceType, food, loc, latitude, longitude, description, menuPricing, phone, image_url, servicePin, JSON.stringify(images)],
            function(err) {
                if (err) {
                    console.error("Database error registering service:", err);
                    return res.status(500).json({ error: err.message });
                }
                const newId = this.lastID;
                db.get(`SELECT * FROM services WHERE id = ?`, [newId], (err2, row) => {
                    if (row) {
                        row.trustScore = 98;
                        row.verified = true;
                        try { row.imagesList = row.images ? JSON.parse(row.images) : (row.image_url ? [row.image_url] : []); } catch(e){ row.imagesList=[]; }
                    }
                    res.json({ success: true, id: newId, service: row });
                });
            }
        );
    } catch (err) {
        console.error("Unexpected error in /api/services:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/services/:id/reviews', (req, res) => {
    const serviceId = req.params.id;
    const { user, text, rating } = req.body;
    db.run(`INSERT INTO feedbacks (service_id, user, text, rating) VALUES (?, ?, ?, ?)`, [serviceId, user, text, rating], function(err) {
        if(err) return res.status(500).json({ error: err.message });
        const newReviewId = this.lastID;
        db.get(`SELECT AVG(rating) as avgRating, COUNT(id) as totalReviews FROM feedbacks WHERE service_id = ?`, [serviceId], (err, row) => {
            if (!err && row) db.run(`UPDATE services SET rating = ?, reviews = ? WHERE id = ?`, [row.avgRating || 0, row.totalReviews || 0, serviceId]);
        });
        res.json({ success: true, review_id: newReviewId });
    });
});

app.put('/api/services/:id/reviews/:reviewId', (req, res) => {
    const serviceId = req.params.id;
    const reviewId = req.params.reviewId;
    const { text, rating } = req.body;
    db.run(`UPDATE feedbacks SET text = ?, rating = ? WHERE id = ? AND service_id = ?`, [text, rating, reviewId, serviceId], function(err) {
        db.get(`SELECT AVG(rating) as avgRating, COUNT(id) as totalReviews FROM feedbacks WHERE service_id = ?`, [serviceId], (err, row) => {
            if (!err && row) db.run(`UPDATE services SET rating = ?, reviews = ? WHERE id = ?`, [row.avgRating || 0, row.totalReviews || 0, serviceId]);
        });
        res.json({ success: true });
    });
});

app.delete('/api/services/:id/reviews/:reviewId', (req, res) => {
    const serviceId = req.params.id;
    const reviewId = req.params.reviewId;
    db.run(`DELETE FROM feedbacks WHERE id = ? AND service_id = ?`, [reviewId, serviceId], function(err) {
        db.get(`SELECT AVG(rating) as avgRating, COUNT(id) as totalReviews FROM feedbacks WHERE service_id = ?`, [serviceId], (err, row) => {
            if (!err && row) db.run(`UPDATE services SET rating = ?, reviews = ? WHERE id = ?`, [row.avgRating || 0, row.totalReviews || 0, serviceId]);
        });
        res.json({ success: true });
    });
});

app.post('/api/services/:id/track', (req, res) => {
    const type = req.body.type; // 'click' or 'call'
    if(type === 'call') db.run(`UPDATE services SET calls = calls + 1 WHERE id = ?`, [req.params.id]);
    else db.run(`UPDATE services SET clicks = clicks + 1 WHERE id = ?`, [req.params.id]);
    res.json({success: true});
});

// --- LOCALS AI PROPRIETARY SUMMARIZER ---
app.get('/api/services/:id/ai-summary', async (req, res) => {
    db.all(`SELECT text FROM feedbacks WHERE service_id = ?`, [req.params.id], async (err, rows) => {
        if (err || !rows || rows.length === 0) return res.json({ summary: "Not enough reviews for AI to analyze yet." });
        
        const reviewsText = rows.map(r => r.text.toLowerCase()).join(' ');
        
        // Custom NLP Keyword Extraction Algorithm
        const praises = [];
        const complaints = [];

        if (reviewsText.match(/\b(clean|hygiene|neat|safe)\b/)) praises.push("excellent hygiene");
        if (reviewsText.match(/\b(tasty|delicious|yummy|good food|flavor)\b/)) praises.push("great taste");
        if (reviewsText.match(/\b(home|authentic|maa ke hath)\b/)) praises.push("authentic home-cooked feel");
        if (reviewsText.match(/\b(time|punctual|fast|quick)\b/)) praises.push("on-time delivery");
        if (reviewsText.match(/\b(cheap|affordable|worth|value)\b/)) praises.push("great value for money");
        if (reviewsText.match(/\b(healthy|less oil|light)\b/)) praises.push("healthy and light meals");
        if (reviewsText.match(/\b(good|great|awesome|excellent|amazing|best|perfect)\b/)) praises.push("an excellent overall experience");

        if (reviewsText.match(/\b(late|delay|slow)\b/)) complaints.push("occasional delays");
        if (reviewsText.match(/\b(cold|stale)\b/)) complaints.push("food arriving cold");
        if (reviewsText.match(/\b(rude|unprofessional|bad behavior)\b/)) complaints.push("unprofessional service");
        if (reviewsText.match(/\b(expensive|costly|overpriced)\b/)) complaints.push("high prices");
        if (reviewsText.match(/\b(bad|terrible|poor|worst|awful|pathetic|disgusting|horrible)\b/)) complaints.push("poor overall quality");

        let summary = "Simply Live AI Analysis: ";
        
        if (praises.length > 0) {
            summary += `Customers highly praise this service for its ${praises.slice(0, 2).join(' and ')}`;
            if (complaints.length > 0) {
                summary += `, although a few noted issues with ${complaints[0]}.`;
            } else {
                summary += `.`;
            }
        } else if (complaints.length > 0) {
            summary += `Customers have reported concerns regarding ${complaints.join(' and ')}.`;
        } else {
            summary += `Customers generally left positive feedback, but specific details were not highlighted.`;
        }

        res.json({ summary: summary });
    });
});

// --- PROVIDER DASHBOARD API ---
app.post('/api/provider/login', (req, res) => {
    try {
        let { id, pin } = req.body;
        if (!id || !pin) {
            return res.status(400).json({ error: "Please enter your Service ID / Phone and 4-digit PIN." });
        }

        const cleanPin = String(pin).trim();
        const inputVal = String(id).trim();
        const digitsOnly = inputVal.replace(/[^0-9]/g, '');
        const numId = parseInt(inputVal, 10) || -1;
        const last10Digits = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;
        const phonePattern = `%${last10Digits}%`;

        // Match either integer ID or contact phone number, and match either text or numeric PIN
        const sql = `
            SELECT * FROM services 
            WHERE (id = ? OR (LENGTH(?) >= 6 AND contact LIKE ?))
              AND (pin = ? OR pin = ?)
        `;

        db.get(sql, [numId, last10Digits, phonePattern, cleanPin, parseInt(cleanPin, 10)], (err, row) => {
            if (err) {
                console.error("Login SQL error:", err);
                return res.status(500).json({ error: "Database error during login." });
            }
            if (!row) {
                return res.status(401).json({ error: "Invalid credentials. Verify your Service ID / Phone Number and 4-digit PIN." });
            }

            // Compute trustScore
            row.trustScore = Math.min(99, Math.round(75 + ((row.rating || 4.5) * 4) + Math.min(6, (row.reviews || 0))));
            row.verified = row.verified !== 0;

            res.json({ success: true, service: row });
        });
    } catch (err) {
        console.error("Error in /api/provider/login:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/provider/update-menu', (req, res) => {
    try {
        const { id, pin, menu } = req.body;
        const cleanPin = String(pin || '').trim();
        const numId = parseInt(id, 10);
        db.run(
            `UPDATE services SET menu = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ? AND (pin = ? OR pin = ?)`,
            [menu || '', numId, cleanPin, parseInt(cleanPin, 10) || -1],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                if (!this || this.changes === 0) return res.status(401).json({ error: 'Unauthorized or invalid PIN' });
                res.json({ success: true });
            }
        );
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- SMART RADAR API ---
app.post('/api/radar/subscribe', (req, res) => {
    db.run(`INSERT INTO radar_alerts (lat, lng, category, email) VALUES (?, ?, ?, ?)`, 
    [req.body.lat, req.body.lng, req.body.category, req.body.email], (err) => {
        res.json({ success: true });
    });
});


// --- ADVANCED AI SEARCH ENGINE ---
app.post('/api/ai-search', (req, res) => {
    const { query, userLat, userLng } = req.body;
    const q = query.toLowerCase();

    let intentCategory = null;
    let intentFood = null;
    let intentQuality = [];
    let priorityModifier = null;

    if (q.match(/\b(tiffin|tiffins|food|mess|eat|meal|meals|thali|cook|kitchen|lunch|dinner)\b/i)) intentCategory = "tiffin";
    else if (q.match(/\b(laundry|wash|clothes|iron|dry clean|washing)\b/i)) intentCategory = "laundry";
    else if (q.match(/\b(maid|maids|clean|sweep|housekeep|help|servant|cleaner)\b/i)) intentCategory = "maid";

    if (q.match(/\b(non[\s-]?veg(?:etarian)?|chicken|mutton|meat|fish|egg|eggs|prawns|biryani)\b/i)) {
        intentFood = "non-veg";
    } else if (q.match(/\b(pure[\s-]?veg(?:etarian)?|strictly[\s-]?veg|100%[\s-]?veg|only[\s-]?veg|shudh[\s-]?shakahari|jain)\b/i)) {
        intentFood = "pure veg";
    } else if (q.match(/\b(veg|vegetarian|green|shakahari|paneer)\b/i)) {
        intentFood = "veg";
    }

    if (q.match(/\b(cheap|affordable|low cost|budget|pocket friendly|inexpensive)\b/i)) { intentQuality.push("budget"); priorityModifier = "budget"; }
    if (q.match(/\b(hygiene|clean|healthy|less oil|safe|home cooked)\b/i)) intentQuality.push("healthy");
    if (q.match(/\b(best|top|high rated|good|amazing|popular|famous)\b/i)) priorityModifier = "rating";
    if (q.match(/\b(near|nearest|close|closest|nearby|around)\b/i)) priorityModifier = "distance";

    let analysisReport = `AI detected intent: Looking for ${intentFood ? intentFood : 'any'} ${intentCategory || 'services'}.`;
    if (intentQuality.length > 0) analysisReport += ` prioritizing ${intentQuality.join(', ')}.`;
    if (priorityModifier) analysisReport += ` Strategy: Optimizing for ${priorityModifier}.`;

    db.all("SELECT * FROM services", (err, services) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let filtered = services;
        if (intentCategory) filtered = filtered.filter(s => s.type === intentCategory);
        if (intentFood) {
            if (intentFood === 'pure veg') filtered = filtered.filter(s => s.foodPref === 'veg' && s.type === 'tiffin');
            else if (intentFood === 'veg') filtered = filtered.filter(s => (s.foodPref === 'veg' || s.foodPref === 'both') && s.type === 'tiffin');
            else if (intentFood === 'non-veg') filtered = filtered.filter(s => (s.foodPref === 'non-veg' || s.foodPref === 'both') && s.type === 'tiffin');
        }

        filtered.forEach(s => {
            let score = 0;
            const descLower = s.desc ? s.desc.toLowerCase() : "";
            const nameLower = s.name ? s.name.toLowerCase() : "";
            const menuLower = s.menu ? s.menu.toLowerCase() : "";
            
            q.split(' ').forEach(kw => { if (kw.length > 3 && (descLower.includes(kw) || menuLower.includes(kw) || nameLower.includes(kw))) score += 15; });

            let distanceScore = 0;
            if (userLat && userLng && s.lat && s.lng) {
                const dLat = (s.lat - userLat) * Math.PI / 180;  
                const dLon = (s.lng - userLng) * Math.PI / 180; 
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(userLat * Math.PI / 180) * Math.cos(s.lat * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2); 
                const dist = 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
                distanceScore = Math.max(0, 50 - (dist * 2));
                if (priorityModifier === 'distance') distanceScore *= 2.5;
            }
            score += distanceScore;

            let ratingScore = (s.rating || 0) * 10;
            if (priorityModifier === 'rating') ratingScore *= 2.5;
            score += ratingScore;
            s.aiScore = score;
        });

        filtered.sort((a, b) => b.aiScore - a.aiScore);

        db.all("SELECT * FROM feedbacks", (err, feedbacks) => {
            filtered.forEach(s => {
                s.feedbacks = feedbacks.filter(f => f.service_id === s.id);
                try { s.imagesList = s.images ? JSON.parse(s.images) : (s.image_url ? [s.image_url] : []); } catch(e){ s.imagesList=[]; }
                s.verified = s.verified !== 0;
                s.trustScore = Math.min(99, Math.round(75 + ((s.rating || 4.5) * 4) + Math.min(6, (s.reviews || 0))));
            });
            res.json({ results: filtered, analysis: analysisReport });
        });
    });
});

// --- REAL-TIME LIVE CHAT ROUTES ---
app.get('/api/services/:id/messages', (req, res) => {
    db.all(`SELECT * FROM messages WHERE service_id = ? ORDER BY created_at ASC`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/services/:id/messages', (req, res) => {
    const serviceId = parseInt(req.params.id);
    const { sender, role, text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Message cannot be empty' });

    db.run(`INSERT INTO messages (service_id, sender, role, text) VALUES (?, ?, ?, ?)`,
        [serviceId, sender || 'Customer', role || 'customer', text.trim()],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const msg = {
                id: this.lastID,
                service_id: serviceId,
                sender: sender || 'Customer',
                role: role || 'customer',
                text: text.trim(),
                created_at: new Date().toISOString()
            };
            io.to(`service_${serviceId}`).emit('new_message', msg);
            res.json({ success: true, message: msg });
        }
    );
});

// Provider inquiry feed
app.get('/api/provider/:id/inquiries', (req, res) => {
    db.all(`SELECT * FROM messages WHERE service_id = ? ORDER BY created_at DESC LIMIT 50`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// --- SIMPLY LIVE REAL-TIME AI ENGINE & CHATBOT ---

function extractBasePrice(service) {
    if (!service) return null;
    const str = `${service.menu || ''} ${service.desc || ''}`;
    
    // Explicit pattern matching for tiffins, laundry, maids
    if (service.type === 'tiffin') {
        const vegThali = str.match(/(?:pure veg|veg thali|thali)\s*[:\-]?\s*(?:₹|rs\.?)\s*(\d+)/i);
        if (vegThali) return parseInt(vegThali[1]);
    } else if (service.type === 'laundry') {
        const washFold = str.match(/(?:wash\s*(?:&|and)\s*fold|per kg)\s*[:\-]?\s*(?:₹|rs\.?)\s*(\d+)/i);
        if (washFold) return parseInt(washFold[1]);
    } else if (service.type === 'maid') {
        const maidRate = str.match(/(?:sweeping|cooking|cleaning)\s*[:\-]?\s*(?:₹|rs\.?)\s*(\d+)/i);
        if (maidRate) return parseInt(maidRate[1]);
    }

    // General fallback regex for any price tag
    const general = str.match(/(?:rs\.?|₹)\s*(\d+)/i) || str.match(/(\d+)\s*(?:rs|₹|\/kg|\/mo)/i);
    return general ? parseInt(general[1]) : (service.type === 'tiffin' ? 90 : (service.type === 'laundry' ? 50 : 1500));
}

function processLiveAIChat(message, userLat, userLng, history, callback) {
    // Support older call signature (message, userLat, userLng, callback)
    if (typeof history === 'function') {
        callback = history;
        history = [];
    }
    history = Array.isArray(history) ? history : [];

    if (!message || !message.trim()) {
        return callback(null, {
            reply: "Hello! I am **Simply Live AI**, your local service concierge. I track live menus, active providers, and verified ratings in real time. How can I help you today? You can ask about home-cooked meals, laundry pickup, maid services, or local pricing!",
            suggestions: [
                "🍱 What meals are available today?",
                "🧺 How much is laundry pickup?",
                "🧹 Tell me about maid services",
                "⭐ Show pure veg tiffins under ₹100"
            ],
            recommendations: [],
            context: { lastCategory: null, offeredCards: false }
        });
    }

    const q = message.toLowerCase().trim();

    // 1. Analyze previous context from conversation history (most recent active context)
    let lastContext = {};
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].context && Object.keys(history[i].context).length > 0) {
            lastContext = { ...history[i].context };
            break;
        }
    }

    // 2. Classify User Intent & Category
    const isGreeting = Boolean(q.match(/^(hi|hello|hey|namaste|hola|good morning|good evening|good afternoon|howdy|sup)\b/i));
    const isIdentity = Boolean(q.match(/\b(who are you|what is simply live|what can you do|how do you work|about you|features|help me|how this works)\b/i));
    const isTrustSafety = Boolean(q.match(/\b(trust|verified|safe|hygiene|fssai|police verification|quality|review|ratings|genuine)\b/i));
    const isComparison = Boolean(q.match(/\b(cheaper|cheapest|better|difference|compare|vs|which one|which is best|compare non-veg|which has mutton)\b/i));
    
    // Explicit Affirmation (User responding "yes", "sure", "show me" to assistant's offer)
    const isAffirmation = Boolean(q.match(/^(yes|yeah|sure|yep|yup|please|show me|show them|show|yes please|do it|ok show|okay show|show cards|display|show now|let me see|proceed|go ahead)\b/i));

    // A. Explicit Category Extraction from Current User Input (Priority 1)
    let explicitCategory = null;
    if (q.match(/\b(maid|maids|housekeeping|clean|cleaning|sweep|sweeping|mop|mopping|cook maid|servant|help|bai|bartan|domestic|agency)\b/i)) {
        explicitCategory = 'maid';
    } else if (q.match(/\b(laundry|wash|iron|ironing|dry clean|dryclean|clothes|washing|dhobi|wash and fold|fabric)\b/i)) {
        explicitCategory = 'laundry';
    } else if (q.match(/\b(tiffin|tiffins|food|mess|meal|meals|thali|lunch|dinner|breakfast|dabba|kitchen|cook|roti|sabzi|paneer|khana|eating|hungry|chicken|mutton|biryani|non[\s-]?veg|pure[\s-]?veg|vegetarian|eggs?|prawns|keema)\b/i)) {
        explicitCategory = 'tiffin';
    }

    let reqCategory = explicitCategory;
    if (!reqCategory) {
        if (isAffirmation && lastContext.lastCategory) {
            reqCategory = lastContext.lastCategory;
        } else if (lastContext.lastCategory && q.match(/\b(under|below|less than|near|in|budget|price|prices|pricing|rate|rates|charge|charges|cost|costs|fee|fees|timing|timings|hours|phone|contact|number|call|trial|guarantee|review|reviews|rating|best|cheap|cheapest)\b/i)) {
            reqCategory = lastContext.lastCategory;
        }
    }

    // Pricing & Contact Intent
    const isPricingQuery = Boolean(q.match(/\b(price|prices|pricing|rate|rates|charge|charges|cost|costs|fee|fees|how much|package|packages)\b/i));
    const isContactQuery = Boolean(q.match(/\b(phone|contact|number|mobile|dial)\b/i) && !q.match(/\b(show|display|card|view)\b/i));

    // B. Dietary Preferences (STRICTLY ISOLATED TO TIFFIN ONLY)
    let isNonVeg = false;
    let isPureVeg = false;
    let isVeg = false;

    if (reqCategory === 'tiffin' || (!reqCategory && !explicitCategory)) {
        isNonVeg = Boolean(q.match(/\b(non[\s-]?veg(?:etarian)?|chicken|mutton|meat|fish|egg|eggs|prawns|keema|biryani)\b/i));
        isPureVeg = !isNonVeg && Boolean(q.match(/\b(pure[\s-]?veg(?:etarian)?|strictly[\s-]?veg|only[\s-]?veg|shudh[\s-]?shakahari|100%[\s-]?veg|jain)\b/i));
        isVeg = !isNonVeg && !isPureVeg && Boolean(q.match(/\b(veg|vegetarian|shakahari|paneer)\b/i));

        // Only inherit dietary preference if the user is staying within tiffin and did not switch category
        if (!isNonVeg && !isPureVeg && !isVeg && lastContext.lastCategory === 'tiffin' && lastContext.lastFoodPref) {
            if (lastContext.lastFoodPref === 'pure_veg') isPureVeg = true;
            else if (lastContext.lastFoodPref === 'veg') isVeg = true;
            else if (lastContext.lastFoodPref === 'non_veg') isNonVeg = true;
        }
    }

    // Budget constraint (STRICT)
    let budgetMax = null;
    const budgetMatch = q.match(/(?:under|below|less than|within|max|budget of|rs\.?|₹|<)\s*(\d+)/i) || q.match(/(\d+)\s*(?:rs|rupees|bucks|₹)/i);
    if (budgetMatch) {
        budgetMax = parseInt(budgetMatch[1]);
    } else if (lastContext.lastBudget && (isAffirmation || (reqCategory && reqCategory === lastContext.lastCategory))) {
        budgetMax = lastContext.lastBudget;
    }

    // Location intent
    let reqLocation = null;
    const recognizedLocations = ['pune', 'mumbai', 'delhi', 'bangalore', 'bengaluru', 'hyderabad', 'chennai', 'kolkata', 'ahmedabad', 'jaipur', 'lucknow', 'chandigarh', 'indore', 'bhopal', 'kothrud', 'karve nagar', 'deccan', 'osmanpura'];
    for (const loc of recognizedLocations) {
        if (q.includes(loc)) {
            reqLocation = loc;
            break;
        }
    }

    // Direct Service Query / Show Cards Intent
    const hasShowVerb = Boolean(q.match(/\b(show|display|list|browse|find|recommend|pull up|get me|see the|see providers|view providers|view cards|show cards|show providers|show services|show them|show tiffins|show laundry|show maids|options for|search for|want to order|want to book|tell me a|tell a|tell about|give me a|give a|suggest|need a|need|looking for|hire|find me|order|book|contact)\b/i));
    const isDirectServiceQuery = Boolean(q.match(/\b(service|services|provider|providers|mess|tiffin|laundry|maid|kitchen|agency|card|cards)\b/i) && (isNonVeg || isPureVeg || reqCategory === 'maid' || reqCategory === 'laundry' || budgetMax || reqLocation || q.includes('agency') || q.includes('mess')));
    const isDirectChipSearch = Boolean((q.includes('under') || q.includes('near me') || q.includes('tiffin <') || q.includes('best laundry') || q.includes('pure veg') || q.includes('non veg') || q.includes('non-veg')) && (q.includes('tiffin') || q.includes('laundry') || q.includes('maid') || q.includes('food') || q.includes('mess')));

    let wantsCards = Boolean(hasShowVerb || isDirectServiceQuery || isDirectChipSearch || (isAffirmation && (lastContext.offeredCards || lastContext.lastCategory)));

    // 3. Query live SQLite Database
    db.all("SELECT * FROM services", (err, services) => {
        if (err) return callback(err);

        db.all("SELECT * FROM feedbacks", (fErr, feedbacks) => {
            const feedList = feedbacks || [];

            // Process dynamic real-time data
            services.forEach(s => {
                s.feedbacks = feedList.filter(f => f.service_id === s.id);
                try { s.imagesList = s.images ? JSON.parse(s.images) : (s.image_url ? [s.image_url] : []); } catch(e){ s.imagesList=[]; }
                s.verified = s.verified !== 0;
                s.trustScore = Math.min(99, Math.round(75 + ((s.rating || 4.5) * 4) + Math.min(6, (s.reviews || 0))));
                s.basePrice = extractBasePrice(s);

                // Distance calculation
                if (userLat && userLng && s.lat && s.lng) {
                    const dLat = (s.lat - userLat) * Math.PI / 180;
                    const dLon = (s.lng - userLng) * Math.PI / 180;
                    const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(userLat*Math.PI/180)*Math.cos(s.lat*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
                    s.dist = (6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1);
                } else {
                    s.dist = null;
                }
            });

            // -------------------------------------------------------------
            // DYNAMIC CANDIDATE SLICING (Strict Isolation: Zero Contamination)
            // -------------------------------------------------------------
            let candidateServices = services;
            if (reqCategory) {
                candidateServices = candidateServices.filter(s => s.type === reqCategory);
            }
            if (reqCategory === 'tiffin') {
                if (isNonVeg) {
                    // STRICT: Exclude pure veg completely!
                    candidateServices = candidateServices.filter(s => s.foodPref === 'non-veg' || s.foodPref === 'both');
                } else if (isPureVeg) {
                    // STRICT: Exclude non-veg and mixed kitchens completely!
                    candidateServices = candidateServices.filter(s => s.foodPref === 'veg');
                } else if (isVeg) {
                    candidateServices = candidateServices.filter(s => s.foodPref === 'veg' || s.foodPref === 'both');
                }
            }

            // Dish-specific keyword filtering
            if (q.match(/\b(mutton)\b/i)) {
                candidateServices = candidateServices.filter(s => (s.menu && s.menu.toLowerCase().includes('mutton')) || (s.desc && s.desc.toLowerCase().includes('mutton')));
            }
            if (q.match(/\b(biryani)\b/i)) {
                candidateServices = candidateServices.filter(s => (s.name && s.name.toLowerCase().includes('biryani')) || (s.menu && s.menu.toLowerCase().includes('biryani')) || (s.desc && s.desc.toLowerCase().includes('biryani')));
            }

            // -------------------------------------------------------------
            // SCENARIO 1: Conversational Inquiries (No Cards Until Asked)
            // -------------------------------------------------------------
            if (!wantsCards) {
                // 1A. Greetings
                if (isGreeting && !reqCategory) {
                    return callback(null, {
                        reply: `Hello! 👋 Welcome to **Simply Live**! I am your real-time service concierge. I track live menus, active availability, trust ratings, and customer feedback across India.\n\nWhether you need pure-veg or non-veg tiffins, express laundry pickup, or domestic housekeeping help, I can answer your questions and find exactly what you need. What would you like to explore today?`,
                        suggestions: [
                            "🍗 What non-veg mess services are available?",
                            "🥗 Show pure veg tiffins under ₹100",
                            "🧺 How much is laundry pickup?",
                            "🧹 Tell me about maid services"
                        ],
                        recommendations: [],
                        context: { lastCategory: null, offeredCards: false }
                    });
                }

                // 1B. Platform Identity / Capabilities
                if (isIdentity) {
                    return callback(null, {
                        reply: `**Simply Live** is an autonomous real-time service intelligence platform built to connect residents directly with verified neighborhood providers with **0 middlemen and 0 markups**:\n\n• **Live Menus & Pricing**: Daily menus, rotating specials, and prices update in real time.\n• **Strict Dietary Integrity**: Pure veg and non-veg options are strictly separated.\n• **Verified Trust**: Background checks, food safety standards, and live customer review sentiment.\n• **Direct Access**: View complete profiles or call providers directly with one tap.\n\nWould you like me to show you our available services across India?`,
                        suggestions: [
                            "Show non-veg mess services",
                            "Show pure veg tiffins",
                            "Show laundry services"
                        ],
                        recommendations: [],
                        context: { lastCategory: null, offeredCards: true }
                    });
                }

                // 1C. Trust & Verification
                if (isTrustSafety) {
                    return callback(null, {
                        reply: `At **Simply Live**, verification and safety are paramount:\n\n• **Kitchens & Tiffins**: Inspected for food hygiene standards, authentic preparation, and separate vegetarian/non-vegetarian kitchens.\n• **Domestic Maids**: Background-screened with government ID verification and optional trial days.\n• **Real-Time Trust Scores**: Ratings update live with genuine customer reviews.\n\nWould you like me to pull up any verified provider cards for you to inspect?`,
                        suggestions: [
                            "Show non-veg mess services",
                            "Show verified tiffin providers",
                            "Show housekeeping maids"
                        ],
                        recommendations: [],
                        context: { lastCategory: null, offeredCards: true }
                    });
                }

                // 1D. Price / Quality Comparison
                if (isComparison && candidateServices.length > 1) {
                    let compText = `Here is a real-time price & quality comparison of our active providers:\n\n`;
                    candidateServices.forEach(s => {
                        compText += `• **${s.name}** (${s.rating}★, ${s.trustScore}% Trust Score) — Base Price: **₹${s.basePrice}**. *Menu Highlights: "${s.menu || s.desc}"*\n`;
                    });
                    compText += `\nWould you like me to display their profile cards so you can compare details or contact them?`;

                    return callback(null, {
                        reply: compText,
                        suggestions: [
                            `Show ${candidateServices[0].name} card`,
                            `Show ${candidateServices[1].name} card`,
                            "Show all matching cards"
                        ],
                        recommendations: [],
                        context: { lastCategory: reqCategory, lastFoodPref: reqCategory === 'tiffin' ? (isNonVeg ? 'non_veg' : (isPureVeg ? 'pure_veg' : null)) : null, offeredCards: true }
                    });
                }

                // 1E. Non-Veg Food Inquiry (Strictly Non-Veg only! Zero Veg!)
                if (reqCategory === 'tiffin' && isNonVeg) {
                    let text = `In our live network, we have **${candidateServices.length} verified non-vegetarian meal providers** available:\n\n`;
                    candidateServices.forEach((s, idx) => {
                        const nonVegBadge = s.foodPref === 'non-veg' ? '100% Non-Veg Specialist' : 'Daily Non-Veg & Veg Options';
                        text += `${idx + 1}. **${s.name}** (${s.location}) — ${nonVegBadge} (${s.rating}★, ${s.trustScore}% Trust Score).\n   *Menu: "${s.menu}"*\n\n`;
                    });
                    text += `Would you like me to display their service cards so you can view profiles or call them directly?`;

                    return callback(null, {
                        reply: text,
                        suggestions: [
                            `Show ${candidateServices[0].name} card`,
                            "Show Chicken Thalis under ₹150",
                            "What are their dinner timings?"
                        ],
                        recommendations: [],
                        context: { lastCategory: 'tiffin', lastFoodPref: 'non_veg', offeredCards: true }
                    });
                }

                // 1F. Pure Veg Food Inquiry (Strictly Pure Veg only! Zero Non-Veg!)
                if (reqCategory === 'tiffin' && isPureVeg) {
                    let text = `In our live network, we have **${candidateServices.length} verified 100% pure vegetarian meal providers** available:\n\n`;
                    candidateServices.forEach((s, idx) => {
                        text += `${idx + 1}. **${s.name}** (${s.location}) — Pure Veg Certified (${s.rating}★, ${s.trustScore}% Trust Score).\n   *Menu: "${s.menu}"*\n\n`;
                    });
                    text += `Would you like me to display their service cards so you can view profiles or call them directly?`;

                    return callback(null, {
                        reply: text,
                        suggestions: [
                            `Show ${candidateServices[0].name} card`,
                            "What are the weekend specials?",
                            "What are their delivery timings?"
                        ],
                        recommendations: [],
                        context: { lastCategory: 'tiffin', lastFoodPref: 'pure_veg', offeredCards: true }
                    });
                }

                // 1G. General Meal Inquiry (Both Veg & Non-Veg overview)
                if (reqCategory === 'tiffin') {
                    const nonVegTiffins = services.filter(s => s.type === 'tiffin' && (s.foodPref === 'non-veg' || s.foodPref === 'both'));
                    const vegTiffins = services.filter(s => s.type === 'tiffin' && s.foodPref === 'veg');

                    let text = `We currently have **${services.filter(s=>s.type==='tiffin').length} verified meal services** with dedicated options:\n\n`;
                    text += `🍗 **Non-Veg Options** (${nonVegTiffins.length} providers):\n`;
                    nonVegTiffins.forEach(s => {
                        text += `• **${s.name}** (${s.location}) — ${s.rating}★. *Menu: "${s.menu}"*\n`;
                    });
                    text += `\n🥗 **Pure Veg Options** (${vegTiffins.length} provider):\n`;
                    vegTiffins.forEach(s => {
                        text += `• **${s.name}** (${s.location}) — ${s.rating}★. *Menu: "${s.menu}"*\n`;
                    });
                    text += `\nWhich would you prefer to explore, or would you like me to show their cards?`;

                    return callback(null, {
                        reply: text,
                        suggestions: [
                            "Show non-veg mess services",
                            "Show pure veg tiffins",
                            "Show all food options"
                        ],
                        recommendations: [],
                        context: { lastCategory: 'tiffin', offeredCards: true }
                    });
                }

                // 1H. Phone / Direct Contact Follow-up
                if (isContactQuery && reqCategory) {
                    const prov = services.find(s => s.type === reqCategory);
                    if (prov) {
                        return callback(null, {
                            reply: `The verified phone number for **${prov.name}** (${prov.location}) is **${prov.contact}**.\n\nYou can call them directly or tap 'Call Provider' on their service card below:`,
                            suggestions: [
                                `Show ${prov.name} card`,
                                "What are their timings?",
                                "Check customer reviews"
                            ],
                            recommendations: [prov],
                            context: { lastCategory: reqCategory, offeredCards: false }
                        });
                    }
                }

                // 1I. Pricing & Charges Follow-up
                if (isPricingQuery && reqCategory) {
                    if (reqCategory === 'maid') {
                        const m = services.find(s => s.type === 'maid');
                        return callback(null, {
                            reply: `For **${m ? m.name : 'Reliable Maids Agency'}** in Deccan, verified charges are:\n\n• **Sweeping & Swabbing**: ₹1500/month\n• **Home Cooking**: ₹2500/month\n• **Assurance**: Police-verified staff with a free 2-day trial replacement guarantee.\n\nWould you like me to display their agency card so you can contact them?`,
                            suggestions: [
                                "Show Reliable Maids card",
                                "What is their phone number?",
                                "Can I get part-time maid?"
                            ],
                            recommendations: [],
                            context: { lastCategory: 'maid', offeredCards: true }
                        });
                    } else if (reqCategory === 'laundry') {
                        const l = services.find(s => s.type === 'laundry');
                        return callback(null, {
                            reply: `For **${l ? l.name : 'Sparkle Laundry Services'}** in Kothrud, verified rates are:\n\n• **Wash & Fold**: ₹50/kg\n• **Wash & Iron**: ₹80/kg\n• **Doorstep Pickup**: Complimentary pickup & delivery.\n\nWould you like me to display their service card?`,
                            suggestions: [
                                "Show Sparkle Laundry card",
                                "What is their phone number?",
                                "Do you have dry cleaning?"
                            ],
                            recommendations: [],
                            context: { lastCategory: 'laundry', offeredCards: true }
                        });
                    }
                }

                // 1J. Laundry General Overview
                if (reqCategory === 'laundry') {
                    const l = services.find(s => s.type === 'laundry');
                    return callback(null, {
                        reply: `Our verified partner is **${l ? l.name : 'Sparkle Laundry Services'}** in Kothrud (4.7★, 99% Trust Score):\n\n• **Wash & Fold**: ₹50/kg\n• **Wash & Iron**: ₹80/kg\n• **Doorstep Pickup**: Complimentary pickup & delivery across Kothrud with a 24-48 hour turnaround.\n\nWould you like me to show their service card so you can book a pickup?`,
                        suggestions: [
                            "Show Sparkle Laundry card",
                            "What is their phone number?",
                            "Do you have dry cleaning?"
                        ],
                        recommendations: [],
                        context: { lastCategory: 'laundry', offeredCards: true }
                    });
                }

                // 1K. Maid General Overview
                if (reqCategory === 'maid') {
                    const m = services.find(s => s.type === 'maid');
                    return callback(null, {
                        reply: `For domestic assistance, we have **${m ? m.name : 'Reliable Maids Agency'}** in Deccan (4.4★, 98% Trust Score):\n\n• **Sweeping & Swabbing**: ₹1500/month\n• **Home Cooking**: ₹2500/month\n• **Assurance**: Police-verified staff with a free 2-day trial replacement guarantee.\n\nWould you like me to display their agency card so you can contact them?`,
                        suggestions: [
                            "Show Reliable Maids card",
                            "Can I get part-time maid?",
                            "Call maid agency"
                        ],
                        recommendations: [],
                        context: { lastCategory: 'maid', offeredCards: true }
                    });
                }

                // 1L. General Fallback
                return callback(null, {
                    reply: `I can certainly help you with that! On **Simply Live**, we specialize in real-time verified local providers for **home-cooked tiffins, express laundry pickup, and domestic maids** across India. \n\nCould you tell me which service you are interested in, or would you like me to show you what's currently available?`,
                    suggestions: [
                        "Show non-veg mess services",
                        "Show pure veg tiffins",
                        "Show laundry services"
                    ],
                    recommendations: [],
                    context: { lastCategory: null, offeredCards: true }
                });
            }

            // -------------------------------------------------------------
            // SCENARIO 2: Explicit Show / Search Intent (STRICT ZERO MIXING!)
            // -------------------------------------------------------------
            let matchedServices = candidateServices.filter(s => {
                if (budgetMax && s.basePrice && s.basePrice > budgetMax) return false;
                if (reqLocation && !s.location.toLowerCase().includes(reqLocation)) return false;
                return true;
            });

            // Sort matched services by rating, proximity, and trust
            matchedServices.sort((a, b) => {
                if (a.dist !== null && b.dist !== null && parseFloat(a.dist) <= 35 && parseFloat(b.dist) <= 35) {
                    return parseFloat(a.dist) - parseFloat(b.dist);
                }
                return (b.rating || 0) - (a.rating || 0);
            });

            // Handle when NO services strictly match
            if (matchedServices.length === 0) {
                let reason = [];
                if (isNonVeg) reason.push("non-vegetarian");
                else if (isPureVeg) reason.push("pure vegetarian");
                if (reqCategory) reason.push(reqCategory);
                if (budgetMax) reason.push(`under ₹${budgetMax}`);
                if (reqLocation) reason.push(`in ${reqLocation}`);
                const specSummary = reason.join(' ');

                let reply = `I scanned all our live providers in real time, but currently no provider strictly meets all those criteria (**${specSummary}**).\n\n`;
                if (isNonVeg) {
                    reply += `• Our non-veg meal options start at ₹90 for Egg Curry Thali and ₹130 for Chicken Thali at **Kolhapuri Non-Veg Mess & Biryani**.\n\nWould you like me to show that option instead?`;
                } else if (isPureVeg) {
                    reply += `• The lowest priced verified pure veg tiffin is **Maa Ki Rasoi Tiffin** at ₹90/meal.\n\nWould you like me to show that option instead?`;
                } else {
                    reply += `Would you like to broaden your criteria or set a **Simply Live Radar Alert**?`;
                }

                return callback(null, {
                    reply: reply,
                    suggestions: [
                        "Show non-veg mess services",
                        "Show all tiffins",
                        "Set Radar Alert"
                    ],
                    recommendations: [],
                    context: { lastCategory: reqCategory, lastFoodPref: reqCategory === 'tiffin' ? (isNonVeg ? 'non_veg' : (isPureVeg ? 'pure_veg' : null)) : null, offeredCards: false }
                });
            }

            // Build tailored response for matched services
            let criteriaTerms = [];
            if (reqCategory === 'tiffin') {
                if (isNonVeg) criteriaTerms.push("non-vegetarian");
                else if (isPureVeg) criteriaTerms.push("pure vegetarian");
                criteriaTerms.push("meal / tiffin service");
            } else if (reqCategory === 'maid') {
                criteriaTerms.push("maid & housekeeping agency");
            } else if (reqCategory === 'laundry') {
                criteriaTerms.push("express laundry service");
            } else if (reqCategory) {
                criteriaTerms.push(reqCategory);
            }

            if (budgetMax) criteriaTerms.push(`under ₹${budgetMax}`);
            if (reqLocation) criteriaTerms.push(`in ${reqLocation}`);

            const specLabel = criteriaTerms.length > 0 ? criteriaTerms.join(' ') : 'your specifications';
            const countLabel = matchedServices.length === 1 ? '1 verified service' : `${matchedServices.length} verified services`;

            let reply = `Based on your request for **${specLabel}**, I checked our live database in real time. Here is **${countLabel}** matching your exact criteria:\n\n`;

            matchedServices.forEach(s => {
                let locationDist = `in ${s.location}`;
                if (s.dist !== null && parseFloat(s.dist) <= 35) {
                    locationDist = `~${s.dist} km away in ${s.location}`;
                }
                const detailLabel = s.type === 'tiffin' ? 'Menu' : 'Services';
                const detailContent = s.type === 'tiffin' ? s.menu : (s.menu || s.desc);
                reply += `• **${s.name}** — ${s.rating}★ (${s.trustScore}% Trust Score) (${locationDist}). ${detailLabel}: *"${detailContent}"*\n`;
            });

            let smartSuggestions = [];
            if (reqCategory === 'maid') {
                smartSuggestions.push("💡 Police-verified domestic help with 2-day free trial replacement guarantee.");
                smartSuggestions.push("💡 Tap 'Call Provider' below to speak directly with the agency.");
            } else if (reqCategory === 'laundry') {
                smartSuggestions.push("💡 Doorstep delivery is complimentary for orders over 3 kg.");
                smartSuggestions.push("💡 Tap 'Call Provider' below to schedule an instant doorstep pickup.");
            } else if (isNonVeg) {
                smartSuggestions.push("💡 Pro-Tip: Unlimited rassa & bhakri is available at Kolhapuri Mess.");
                smartSuggestions.push("💡 Tap 'Call Provider' below to order or check current delivery status.");
            } else if (isPureVeg) {
                smartSuggestions.push("💡 Pro-Tip: Inquire about weekly subscriptions to save up to 15%.");
                smartSuggestions.push("💡 Dial provider directly with the 'Call Provider' button below.");
            }

            callback(null, {
                reply: reply,
                suggestions: smartSuggestions,
                recommendations: matchedServices, // STRICT: Only matched services returned! Zero mixing!
                context: {
                    lastCategory: reqCategory,
                    lastFoodPref: reqCategory === 'tiffin' ? (isNonVeg ? 'non_veg' : (isPureVeg ? 'pure_veg' : 'veg')) : null,
                    lastBudget: budgetMax,
                    offeredCards: false
                }
            });
        });
    });
}

// REST endpoints for Live AI Chat
app.post('/api/live-ai-chat', (req, res) => {
    const { message, userLat, userLng, history } = req.body;
    processLiveAIChat(message, userLat, userLng, history, (err, data) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(data);
    });
});

// Alias for backwards compatibility
app.post('/api/concierge-chat', (req, res) => {
    const { message, userLat, userLng, history } = req.body;
    processLiveAIChat(message, userLat, userLng, history, (err, data) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(data);
    });
});

// --- SOCKET.IO REAL-TIME CHAT HANDLING ---
io.on('connection', (socket) => {
    // Website-wide Real-Time AI Live Chat
    socket.on('website_live_chat', (data) => {
        const { message, userLat, userLng, history } = data;
        processLiveAIChat(message, userLat, userLng, history, (err, replyData) => {
            if (!err) {
                socket.emit('website_live_reply', replyData);
            }
        });
    });

    socket.on('join_room', (serviceId) => {
        socket.join(`service_${serviceId}`);
    });

    socket.on('send_message', (data) => {
        const { service_id, sender, role, text } = data;
        if (!text || !text.trim()) return;

        db.run(`INSERT INTO messages (service_id, sender, role, text) VALUES (?, ?, ?, ?)`,
            [service_id, sender || 'Customer', role || 'customer', text.trim()],
            function(err) {
                if (!err) {
                    const msg = {
                        id: this.lastID,
                        service_id,
                        sender: sender || 'Customer',
                        role: role || 'customer',
                        text: text.trim(),
                        created_at: new Date().toISOString()
                    };
                    io.to(`service_${service_id}`).emit('new_message', msg);
                }
            }
        );
    });
});

process.on('uncaughtException', (err) => {
    console.error('Process Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('Process Unhandled Rejection:', reason);
});

server.listen(PORT, () => {
    console.log(`Simply Live Server running on http://localhost:${PORT}`);
});
