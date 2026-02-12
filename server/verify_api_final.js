import axios from 'axios';

async function verify() {
    try {
        console.log('--- Verifying Search API ---');
        const searchRes = await axios.get('http://localhost:3001/api/search?q=삼성');
        console.log('Search Results for "삼성":', JSON.stringify(searchRes.data, null, 2));

        console.log('\n--- Verifying Recommendations API ---');
        const recRes = await axios.get('http://localhost:3001/api/recommendations');
        console.log('Recommendations Count:', recRes.data.length);
        if (recRes.data.length > 0) {
            console.log('First Recommendation:', JSON.stringify(recRes.data[0], null, 2));
        }

        console.log('\n--- Verifying Holdings API ---');
        const holdingsRes = await axios.get('http://localhost:3001/api/holdings');
        console.log('Holdings Count:', holdingsRes.data.length);
        console.log('Holdings:', JSON.stringify(holdingsRes.data, null, 2));

    } catch (e) {
        console.error('Verification failed:', e.message);
    }
}

verify();
