"""Private append-only owner investment preferences."""
import json
from jarvis.data import database
from jarvis.domains.finance.investment_policy import validate_policy


def get_policy():
    connection=database.get_db()
    try:
        row=connection.execute('SELECT value_json FROM finance_investment_policies ORDER BY id DESC LIMIT 1').fetchone()
        return None if row is None else validate_policy(json.loads(row['value_json']))
    finally:
        connection.close()


def save_policy(value):
    policy=validate_policy(value)
    connection=database.get_db()
    try:
        connection.execute('INSERT INTO finance_investment_policies(value_json,created_at) VALUES (?,?)',
                           (json.dumps(policy,sort_keys=True,allow_nan=False),database._utc_now()))
        connection.commit()
        return policy
    finally:
        connection.close()
