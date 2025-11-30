from aws_lambda_powertools import Logger

# Centralized logger for the poll-notifications Lambda. Using a shared instance
# keeps structured metadata consistent across modules.
logger = Logger(service="poll-notifications")
