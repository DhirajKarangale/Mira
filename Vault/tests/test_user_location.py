import unittest
from fastapi.testclient import TestClient
import config_storage
from app import app


class TestUserLocation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        config_storage.init_config_storage()
        cls.client = TestClient(app)

    def setUp(self):
        # Save current user profile to restore after test
        self.original_user = config_storage.get_configuration('user_details')

    def tearDown(self):
        # Restore original user profile
        if self.original_user:
            config_storage.update_configuration('user_details', self.original_user)

    def test_schema_has_new_location_columns(self):
        """Verify schema parsed columns for user_details include address, postal_code, latitude, longitude."""
        tables = config_storage.parse_schema_file()
        user_spec = tables.get('user_details')
        self.assertIsNotNone(user_spec)
        cols = user_spec['columns']
        self.assertIn('address', cols)
        self.assertIn('postal_code', cols)
        self.assertIn('latitude', cols)
        self.assertIn('longitude', cols)

        types = user_spec['types']
        self.assertEqual(types.get('latitude'), 'REAL')
        self.assertEqual(types.get('longitude'), 'REAL')

    def test_get_and_update_user_location(self):
        """Verify updating address, postal code, latitude, and longitude."""
        updates = {
            'address': 'Koregaon Park, Pune, Maharashtra, India',
            'postal_code': '411001',
            'latitude': 18.5362,
            'longitude': 73.8940,
        }
        res = config_storage.update_configuration('user_details', updates)
        self.assertEqual(res['address'], 'Koregaon Park, Pune, Maharashtra, India')
        self.assertEqual(res['postal_code'], '411001')
        self.assertAlmostEqual(res['latitude'], 18.5362, places=4)
        self.assertAlmostEqual(res['longitude'], 73.8940, places=4)

        # Retrieve again to verify persistence
        fetched = config_storage.get_configuration('user_details')
        self.assertEqual(fetched['address'], 'Koregaon Park, Pune, Maharashtra, India')
        self.assertEqual(fetched['postal_code'], '411001')
        self.assertAlmostEqual(fetched['latitude'], 18.5362, places=4)
        self.assertAlmostEqual(fetched['longitude'], 73.8940, places=4)

    def test_missing_postal_code_not_invented(self):
        """Verify that when postal code is absent or empty, it is stored as empty and no fake value is invented."""
        updates = {
            'address': 'Rural Outpost, Region, Country',
            'postal_code': '',
            'latitude': -9.3694,
            'longitude': 124.3172,
        }
        res = config_storage.update_configuration('user_details', updates)
        self.assertEqual(res['postal_code'], '')
        self.assertEqual(res['address'], 'Rural Outpost, Region, Country')
        self.assertAlmostEqual(res['latitude'], -9.3694, places=4)
        self.assertAlmostEqual(res['longitude'], 124.3172, places=4)

    def test_fastapi_endpoints_user_location(self):
        """Verify GET and POST /user endpoints return and save new location fields."""
        payload = {
            'user_name': 'Dhiraj',
            'email': 'dakarangale02@gmail.com',
            'phone_number': '+91 7620320595',
            'city': 'Berlin',
            'state': 'State of Berlin',
            'country': 'Germany',
            'address': 'Berlin, State of Berlin, Germany',
            'postal_code': '10115',
            'latitude': 52.5200,
            'longitude': 13.4050,
        }
        post_res = self.client.post('/user', json=payload)
        self.assertEqual(post_res.status_code, 200)
        data = post_res.json()
        self.assertEqual(data['address'], 'Berlin, State of Berlin, Germany')
        self.assertEqual(data['postal_code'], '10115')
        self.assertAlmostEqual(data['latitude'], 52.5200, places=4)
        self.assertAlmostEqual(data['longitude'], 13.4050, places=4)
        self.assertTrue(data['exists'])
        self.assertEqual(data['message'], 'User details saved successfully')

        # Test GET /user
        get_res = self.client.get('/user')
        self.assertEqual(get_res.status_code, 200)
        get_data = get_res.json()
        self.assertEqual(get_data['city'], 'Berlin')
        self.assertEqual(get_data['address'], 'Berlin, State of Berlin, Germany')
        self.assertEqual(get_data['postal_code'], '10115')
        self.assertAlmostEqual(get_data['latitude'], 52.5200, places=4)
        self.assertAlmostEqual(get_data['longitude'], 13.4050, places=4)
        self.assertTrue(get_data['exists'])


if __name__ == '__main__':
    unittest.main()
