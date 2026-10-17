import os
import tempfile

# Aislamiento: los tests nunca tocan mimuro.db real.
_tmp_db = os.path.join(tempfile.gettempdir(), "mimuro_test.db")
if os.path.exists(_tmp_db):
    try:
        os.remove(_tmp_db)
    except OSError:
        pass
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp_db}"
