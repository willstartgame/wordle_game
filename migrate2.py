import sqlite3
import os

db_path = os.path.join("instance", "wordle.db")
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    try:
        c.execute('ALTER TABLE game_record ADD COLUMN mode VARCHAR(20) DEFAULT "frenzy"')
        c.execute('ALTER TABLE game_record ADD COLUMN is_win BOOLEAN DEFAULT 0')
        conn.commit()
        print("Successfully added mode and is_win columns to game_record.")
    except sqlite3.OperationalError as e:
        print(f"OperationalError: {e}. The column might already exist.")
    conn.close()
else:
    print(f"Database not found at {db_path}")
