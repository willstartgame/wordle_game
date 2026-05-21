import sqlite3
import os

db_path = os.path.join("instance", "wordle.db")
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    try:
        c.execute('ALTER TABLE player ADD COLUMN battle_wins INTEGER DEFAULT 0')
        conn.commit()
        print("Successfully added battle_wins column to player table.")
    except sqlite3.OperationalError as e:
        print(f"OperationalError: {e}. The column might already exist.")
    conn.close()
else:
    print(f"Database not found at {db_path}")
