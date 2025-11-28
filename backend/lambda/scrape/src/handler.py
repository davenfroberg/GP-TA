from aws_lambda_powertools.metrics import MetricUnit

from config.logger import logger
from config.metrics import metrics
from scrapers.FullScraper import FullScraper
from scrapers.IncrementalScraper import IncrementalScraper


@logger.inject_lambda_context(log_event=True)
@metrics.log_metrics(capture_cold_start_metric=False)
def lambda_handler(event, context):
    scrape_type = event.get("type") or "unknown"
    metrics.add_dimension(name="ScrapeType", value=scrape_type)
    metrics.add_metric(name="ScrapeRequests", unit=MetricUnit.Count, value=1)

    if scrape_type == "incremental":
        scraper = IncrementalScraper()
    elif scrape_type == "full":
        scraper = FullScraper()
    else:
        logger.exception("Invalid scrape type requested", extra={"scrape_type": scrape_type})
        metrics.add_metric(name="ScrapeFailures", unit=MetricUnit.Count, value=1)
        raise ValueError("Invalid scrape type")

    logger.info("Starting scrape request", extra={"scrape_type": scrape_type})
    try:
        result = scraper.scrape(event)
    except Exception:
        metrics.add_metric(name="ScrapeFailures", unit=MetricUnit.Count, value=1)
        raise

    logger.info("Scrape completed", extra={"scrape_type": scrape_type})
    return result