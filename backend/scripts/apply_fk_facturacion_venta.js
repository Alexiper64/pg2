const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'crud'
});

const sql = `ALTER TABLE facturacion
  ADD CONSTRAINT fk_facturacion_venta FOREIGN KEY (venta_id) REFERENCES ventas(id);`;

console.log('Applying FK migration...');

db.query(sql, (err, result) => {
  if (err) {
    console.error('Error applying FK:', err);
    db.end();
    process.exit(1);
  }
  console.log('FK applied successfully');
  db.end();
});
