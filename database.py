import os
import uuid
import json
import copy
import datetime
import logging

try:
    from google.cloud import firestore
except Exception as import_err:
    logger = logging.getLogger(__name__)
    logger.warning(f"Could not import google-cloud-firestore (expected on Python 3.14+): {import_err}")
    firestore = None

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ==============================================================================
# Mock Firestore Client (Zero-Dependency Offline Fallback)
# ==============================================================================

class MockDocumentSnapshot:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return copy.deepcopy(self._data) if self._data else {}

class MockDocumentReference:
    def __init__(self, client, collection_name, doc_id):
        self.client = client
        self.collection_name = collection_name
        self.id = doc_id

    def get(self):
        data = self.client._get_doc(self.collection_name, self.id)
        return MockDocumentSnapshot(self.id, data)

    def set(self, data):
        self.client._set_doc(self.collection_name, self.id, data)

    def update(self, data):
        self.client._update_doc(self.collection_name, self.id, data)

    def delete(self):
        self.client._delete_doc(self.collection_name, self.id)

class MockQuery:
    def __init__(self, client, collection_name, docs, filters=None, limit_val=None):
        self.client = client
        self.collection_name = collection_name
        self.docs = docs
        self.filters = filters or []
        self.limit_val = limit_val

    def where(self, field, op, value):
        new_filters = self.filters + [(field, op, value)]
        filtered_docs = []
        for doc in self.docs:
            data = doc['data']
            match = True
            val = data.get(field)
            if op == '==':
                if val != value:
                    match = False
            elif op == 'in':
                if not isinstance(value, list) or val not in value:
                    match = False
            # Basic operations support
            if match:
                filtered_docs.append(doc)
        return MockQuery(self.client, self.collection_name, filtered_docs, new_filters, self.limit_val)

    def limit(self, n):
        return MockQuery(self.client, self.collection_name, self.docs, self.filters, n)

    def get(self):
        res = self.docs
        if self.limit_val is not None:
            res = res[:self.limit_val]
        return [MockDocumentSnapshot(d['id'], d['data']) for d in res]

    def stream(self):
        return self.get()

class MockCollectionReference:
    def __init__(self, client, name):
        self.client = client
        self.name = name

    def document(self, doc_id=None):
        if doc_id is None:
            doc_id = uuid.uuid4().hex
        return MockDocumentReference(self.client, self.name, doc_id)

    def list_documents(self):
        all_docs = self.client._get_collection_docs(self.name)
        return [MockDocumentReference(self.client, self.name, d['id']) for d in all_docs]

    def where(self, field, op, value):
        all_docs = self.client._get_collection_docs(self.name)
        q = MockQuery(self.client, self.name, all_docs)
        return q.where(field, op, value)

    def limit(self, n):
        all_docs = self.client._get_collection_docs(self.name)
        q = MockQuery(self.client, self.name, all_docs)
        return q.limit(n)

    def get(self):
        all_docs = self.client._get_collection_docs(self.name)
        return [MockDocumentSnapshot(d['id'], d['data']) for d in all_docs]

    def stream(self):
        return self.get()

class MockFirestoreClient:
    def __init__(self, filepath=None):
        if filepath is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            data_dir = os.path.join(base_dir, "data")
            os.makedirs(data_dir, exist_ok=True)
            filepath = os.path.join(data_dir, "local_db.json")
        self.filepath = filepath
        self._db = {}
        self._load()

    def _load(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, 'r', encoding='utf-8') as f:
                    self._db = json.load(f)
            except Exception as e:
                logger.error(f"Error loading mock JSON db: {e}")
                self._db = {}
        else:
            self._db = {}

    def _save(self):
        try:
            def serialize(obj):
                if isinstance(obj, (datetime.datetime, datetime.date)):
                    return obj.isoformat()
                raise TypeError(f"Type {type(obj)} not serializable")
            
            with open(self.filepath, 'w', encoding='utf-8') as f:
                json.dump(self._db, f, default=serialize, indent=2)
        except Exception as e:
            logger.error(f"Error saving mock db to file: {e}")

    def collection(self, name):
        return MockCollectionReference(self, name)

    def _get_collection_docs(self, collection_name):
        coll = self._db.get(collection_name, {})
        return [{'id': k, 'data': v} for k, v in coll.items()]

    def _get_doc(self, collection_name, doc_id):
        data = self._db.get(collection_name, {}).get(doc_id)
        if data:
            data = copy.deepcopy(data)
            def deserialize_dates(item):
                if isinstance(item, dict):
                    for k, v in item.items():
                        if isinstance(v, str):
                            try:
                                if len(v) >= 10 and (v[4] == '-' and v[7] == '-'):
                                    item[k] = datetime.datetime.fromisoformat(v.replace('Z', '+00:00'))
                            except ValueError:
                                pass
                        elif isinstance(v, (dict, list)):
                            deserialize_dates(v)
                elif isinstance(item, list):
                    for i in range(len(item)):
                        val = item[i]
                        if isinstance(val, str):
                            try:
                                if len(val) >= 10 and (val[4] == '-' and val[7] == '-'):
                                    item[i] = datetime.datetime.fromisoformat(val.replace('Z', '+00:00'))
                            except ValueError:
                                pass
                        elif isinstance(val, (dict, list)):
                            deserialize_dates(val)
            deserialize_dates(data)
        return data

    def _set_doc(self, collection_name, doc_id, data):
        if collection_name not in self._db:
            self._db[collection_name] = {}
        
        # Format any datetime values to string before deepcopy or serializing
        data_to_store = copy.deepcopy(data)
        def convert_dates(item):
            if isinstance(item, dict):
                for k, v in item.items():
                    if isinstance(v, (datetime.datetime, datetime.date)):
                        item[k] = v.isoformat()
                    elif isinstance(v, (dict, list)):
                        convert_dates(v)
            elif isinstance(item, list):
                for i in range(len(item)):
                    val = item[i]
                    if isinstance(val, (datetime.datetime, datetime.date)):
                        item[i] = val.isoformat()
                    elif isinstance(val, (dict, list)):
                        convert_dates(val)
        convert_dates(data_to_store)
        
        self._db[collection_name][doc_id] = data_to_store
        self._save()

    def _update_doc(self, collection_name, doc_id, data):
        if collection_name not in self._db:
            self._db[collection_name] = {}
        if doc_id not in self._db[collection_name]:
            self._db[collection_name][doc_id] = {}
        
        data_to_update = copy.deepcopy(data)
        def convert_dates(item):
            if isinstance(item, dict):
                for k, v in item.items():
                    if isinstance(v, (datetime.datetime, datetime.date)):
                        item[k] = v.isoformat()
                    elif isinstance(v, (dict, list)):
                        convert_dates(v)
            elif isinstance(item, list):
                for i in range(len(item)):
                    val = item[i]
                    if isinstance(val, (datetime.datetime, datetime.date)):
                        item[i] = val.isoformat()
                    elif isinstance(val, (dict, list)):
                        convert_dates(val)
        convert_dates(data_to_update)

        for k, v in data_to_update.items():
            self._db[collection_name][doc_id][k] = v
        self._save()

    def _delete_doc(self, collection_name, doc_id):
        if collection_name in self._db and doc_id in self._db[collection_name]:
            del self._db[collection_name][doc_id]
            self._save()

# ==============================================================================
# Client Initialization with Fallback
# ==============================================================================

db = None
using_mock = False

try:
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "worknoon-refund-agent")
    emulator_host = os.getenv("FIRESTORE_EMULATOR_HOST")

    # In local offline mode where Docker Desktop is not running, we try connecting to the emulator, 
    # but fallback instantly if there is no emulator running or if connection fails.
    if firestore is not None and emulator_host:
        logger.info(f"Attempting connection to Firestore EMULATOR at {emulator_host}...")
        # Check if the host port is actually open/listening
        import socket
        try:
            host, port = emulator_host.split(":")
            # Short timeout to detect if port is open
            s = socket.create_connection((host, int(port)), timeout=1.0)
            s.close()
            
            # Emulator is running!
            db = firestore.Client(project=project_id)
            logger.info("Successfully connected to the running Firestore Emulator.")
        except Exception as conn_err:
            logger.warning(f"Firestore Emulator port {emulator_host} is not reachable. Falling back to local offline Mock database. ({conn_err})")
            db = MockFirestoreClient()
            using_mock = True
    elif firestore is not None:
        # Check if live firestore client can be initialized (requires credentials)
        try:
            db = firestore.Client(project=project_id)
            logger.info(f"Initialized Firestore Client for Project: {project_id}")
        except Exception as live_err:
            logger.warning(f"Could not initialize Live Firestore client: {live_err}. Falling back to local offline Mock database.")
            db = MockFirestoreClient()
            using_mock = True
    else:
        logger.info("Firestore client library is not loaded (or unsupported). Using mock offline database.")
        db = MockFirestoreClient()
        using_mock = True

except Exception as e:
    logger.warning(f"Error during Firestore initialization: {str(e)}. Falling back to local offline Mock database.")
    db = MockFirestoreClient()
    using_mock = True

def get_db():
    """Dependency helper to get the database client."""
    return db
