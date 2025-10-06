from scrapers.FullScraper import FullScraper
from scrapers.IncrementalScraper import IncrementalScraper

def lambda_handler(event, context):
    scrape_type = event["type"]
    if scrape_type == "incremental":
        scraper = IncrementalScraper()
    elif scrape_type == "full":
        scraper = FullScraper()
    else:
        raise ValueError("Invalid scrape type")
    print(f"Performing scrape with type: {scrape_type}")
    result = scraper.scrape()
    return result