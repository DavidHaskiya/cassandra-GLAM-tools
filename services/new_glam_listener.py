import logging
import os
from datetime import date, datetime, timedelta
from sqs_listener import SqsListener
from config import config
from etl.glams_table import get_glam_by_name
from etl.run import first_time_process
from etl.views import process_mediacounts


def process_new_glam_views(glam_name):
    glam = get_glam_by_name(glam_name)
    date_val = datetime.strptime(
        config['mediacountStartDate'], "%Y-%m-%d").date()
    today = date.today()
    while date_val < today:
        process_mediacounts([glam], date_val)
        date_val = date_val + timedelta(days = 1)


def initialize_new_glam(glam_name):
    glam = get_glam_by_name(glam_name)
    first_time_process(glam)
    process_new_glam_views(glam_name)

class NewGlamListener(SqsListener):
    def handle_message(self, body, attributes, messages_attributes):
        glam_name = body["name"]
        logging.info(f'Received new message. Glam name: {glam_name}')
        initialize_new_glam(glam_name)


os.environ['AWS_ACCOUNT_ID'] = config['aws']['config']['credentials']['accessKeyId']

if __name__ == "__main__":
    listener = NewGlamListener(
        config['aws']['newGlamQueueName'],
        region_name=config['aws']['config']['region'],
        queue_url=config['aws']['newGlamQueueUrl']
    )
    listener.listen()
