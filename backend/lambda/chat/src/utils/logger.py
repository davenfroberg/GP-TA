from aws_lambda_powertools import Logger

# Centralized logger for the chat Lambda. Using a shared instance
# keeps structured metadata consistent across modules.
# Note: Logging is kept minimal since this function is called frequently during conversations.
logger = Logger(service="chat")

