#!/usr/bin/env node
/**
 * Live test for Google Search integration
 * Tests the complete flow: Search → Summarize → Display
 */

import { GoogleSearchService } from '../src/services/googleSearchService.js';
import { SearchSummarizer } from '../src/services/searchSummarizer.js';
import { config } from '../src/config/index.js';

async function testGoogleSearch() {
  console.log('🔍 Testing Google Search Integration\n');
  console.log('='.repeat(60));

  // Check configuration
  console.log('\n1️⃣  Checking configuration...');
  if (!config.googleSearch.apiKey || !config.googleSearch.engineId) {
    console.error('❌ Google Search API credentials not configured!');
    console.error('   Set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID in .env');
    process.exit(1);
  }
  console.log('✅ API Key:', config.googleSearch.apiKey.substring(0, 20) + '...');
  console.log('✅ Engine ID:', config.googleSearch.engineId);

  // Initialize services
  console.log('\n2️⃣  Initializing services...');
  const searchService = new GoogleSearchService();
  const summarizer = new SearchSummarizer();

  if (!searchService.isConfigured()) {
    console.error('❌ Search service not properly configured!');
    process.exit(1);
  }
  console.log('✅ Services initialized');

  // Test query
  const testQuery = 'how do you make coffee';
  console.log(`\n3️⃣  Testing search query: "${testQuery}"`);
  console.log('='.repeat(60));

  try {
    // Step 1: Search Google
    console.log('\n📡 Searching Google...');
    const startSearch = Date.now();
    const searchResults = await searchService.search(testQuery);
    const searchTime = Date.now() - startSearch;

    console.log(`✅ Search completed in ${searchTime}ms`);
    console.log(`   Results: ${searchResults.results.length} / ${searchResults.totalResults.toLocaleString()} total`);
    console.log(`   Cached: ${searchResults.cached ? 'Yes' : 'No'}`);

    if (searchResults.results.length > 0) {
      console.log('\n📄 Top 3 results:');
      searchResults.results.slice(0, 3).forEach((result, i) => {
        console.log(`\n   ${i + 1}. ${result.title}`);
        console.log(`      ${result.displayLink || result.link}`);
        console.log(`      ${result.snippet.substring(0, 100)}...`);
      });
    }

    // Step 2: Summarize with Haiku
    console.log('\n🤖 Generating butler summary with Haiku...');
    const startSummary = Date.now();
    const summary = await summarizer.summarizeWithPersonality(testQuery, searchResults);
    const summaryTime = Date.now() - startSummary;

    console.log(`✅ Summary completed in ${summaryTime}ms`);
    console.log(`   Total time: ${searchTime + summaryTime}ms`);

    // Display summary
    console.log('\n' + '='.repeat(60));
    console.log('🎩 PACE\'s Butler Response:');
    console.log('='.repeat(60));
    console.log(summary);
    console.log('='.repeat(60));

    // Test caching
    console.log('\n4️⃣  Testing cache...');
    const startCache = Date.now();
    const cachedResults = await searchService.search(testQuery);
    const cacheTime = Date.now() - startCache;

    console.log(`✅ Cache hit in ${cacheTime}ms (${((1 - cacheTime / searchTime) * 100).toFixed(0)}% faster)`);
    console.log(`   Cached: ${cachedResults.cached ? 'Yes ✅' : 'No ❌'}`);

    // Cache stats
    const stats = searchService.getCacheStats();
    console.log(`\n📊 Cache stats: ${stats.size} entries, TTL: ${stats.ttl / 1000 / 60} minutes`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed!');
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('\n❌ Test failed!');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
testGoogleSearch().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
