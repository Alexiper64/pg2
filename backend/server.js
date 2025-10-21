const express = require('express');
const mysql = require('mysql');
const cors = require('cors');


const app = express();
app.use(express.json());
app.use(cors());

// Helper: sanitize phone numbers to digits-only (or null)
function sanitizePhone(value) {
    if (value === undefined || value === null) return null;
    const digits = String(value).replace(/\D/g, '');
    return digits === '' ? null : digits;
}

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crud'
})

// Helper: recompute monto for a factura from detallefacturacion
function recomputeMonto(facturaId, cb) {
    const sqlMonto = 'SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS monto FROM detallefacturacion WHERE facturacion_id = ?';
    db.query(sqlMonto, [facturaId], (err, rows) => {
        if (err) return cb(err);
        const monto = (rows && rows[0] && rows[0].monto) ? Number(rows[0].monto) : 0;
        cb(null, monto);
    });
}

// Helper: ensure there's a ventas row for this factura and sync its monto
function syncFacturaVentaMonto(facturaId) {
    // recompute monto first
    recomputeMonto(facturaId, (err, monto) => {
        if (err) { console.error('Error recomputing monto for factura', facturaId, err); return; }
        // check if factura has venta_id and then create/update venta inside a transaction
        db.query('SELECT venta_id, fecha, cliente_id FROM facturacion WHERE id = ?', [facturaId], (errF, rowsF) => {
            if (errF || !rowsF || !rowsF[0]) { if (errF) console.error('Error reading factura for sync', errF); return; }
            const ventaId = rowsF[0].venta_id;
            const fecha = rowsF[0].fecha;
            const cliente_id = rowsF[0].cliente_id;
            db.beginTransaction(txErr => {
                if (txErr) { console.error('Transaction start error for syncFacturaVentaMonto:', txErr); return; }
                if (ventaId) {
                    // update existing venta
                    db.query('UPDATE ventas SET fecha = ?, cliente_id = ?, monto = ? WHERE id = ?', [fecha || null, cliente_id || null, monto || 0, ventaId], (eU) => {
                        if (eU) {
                            console.error('Error actualizando venta desde factura sync (rolling back):', eU);
                            return db.rollback(() => {});
                        }
                        db.commit(cErr => { if (cErr) { console.error('Commit error updating venta:', cErr); db.rollback(() => {}); } });
                    });
                } else {
                    // create venta and update factura.venta_id
                    db.query('INSERT INTO ventas (fecha, cliente_id, monto) VALUES (?, ?, ?)', [fecha || null, cliente_id || null, monto || 0], (eI, rI) => {
                        if (eI) {
                            console.error('Error creando venta desde factura sync (rolling back):', eI);
                            return db.rollback(() => {});
                        }
                        const newVentaId = rI.insertId;
                        db.query('UPDATE facturacion SET venta_id = ? WHERE id = ?', [newVentaId, facturaId], (eUpd) => {
                            if (eUpd) {
                                console.error('Error guardando venta_id en facturacion (rolling back):', eUpd);
                                return db.rollback(() => {});
                            }
                            db.commit(cErr => { if (cErr) { console.error('Commit error creating venta:', cErr); db.rollback(() => {}); } });
                        });
                    });
                }
            });
        });
    });
}

app.post('/login', (req, res) => {
    const sql = 'SELECT * FROM login WHERE username = ? AND password = ?';

    db.query(sql, [req.body.email, req.body.password], (err, data) => {
        if (err) return res.json("Error");
        if (data.length > 0) {
            return res.json("Login Successful"); 
        } else {
            return res.status(401).send('Credenciales inválidas');
        }
    })
})

// ---------- Clientes API ----------
// Estructura real de la tabla `clientes` (ahora en minúsculas):
// id (INT AUTO_INCREMENT PK), empresa, nombre, apellido, telefono, correo_electronico, direccion

// Obtener todos los clientes
app.get('/clientes', (req, res) => {
    const sql = 'SELECT id, empresa, nombre, apellido, nit, telefono, correo_electronico AS correo, direccion FROM clientes';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error al obtener clientes:', err);
            return res.status(500).json({ error: 'Error al obtener clientes' });
        }
        res.json(results);
    });
});

// Obtener cliente por id
app.get('/clientes/:id', (req, res) => {
    const sql = 'SELECT id, empresa, nombre, apellido, nit, telefono, correo_electronico AS correo, direccion FROM clientes WHERE id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error al obtener cliente:', err);
            return res.status(500).json({ error: 'Error al obtener cliente' });
        }
        if (results.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.json(results[0]);
    });
});

// Crear nuevo cliente
app.post('/clientes', (req, res) => {
    const { empresa, nombre, apellido, nit, telefono, correo, direccion } = req.body;
    if (!nombre || !apellido) return res.status(400).json({ error: 'Nombre y apellido son requeridos' });
    // sanitize telefono to avoid inserting formatted strings (e.g. "1234-5678") that
    // could be cast/truncated by the DB if the column is numeric
    const telefonoSan = sanitizePhone(telefono);

    const sql = 'INSERT INTO clientes (empresa, nombre, apellido, nit, telefono, correo_electronico, direccion) VALUES (?, ?, ?, ?, ?, ?, ?)';
    db.query(sql, [empresa || null, nombre, apellido, nit || null, telefonoSan, correo || null, direccion || null], (err, result) => {
        if (err) {
            console.error('Error al crear cliente:', err);
            return res.status(500).json({ error: 'Error al crear cliente' });
        }
        res.status(201).json({ id: result.insertId, empresa, nombre, apellido, nit: nit || null, telefono: telefonoSan, correo, direccion });
    });
});

// Actualizar cliente
app.put('/clientes/:id', (req, res) => {
    const { empresa, nombre, apellido, nit, telefono, correo, direccion } = req.body;
    const telefonoSan = sanitizePhone(telefono);
    const sql = 'UPDATE clientes SET empresa = ?, nombre = ?, apellido = ?, nit = ?, telefono = ?, correo_electronico = ?, direccion = ? WHERE id = ?';
    db.query(sql, [empresa || null, nombre || null, apellido || null, nit || null, telefonoSan, correo || null, direccion || null, req.params.id], (err, result) => {
        if (err) {
            console.error('Error al actualizar cliente:', err);
            return res.status(500).json({ error: 'Error al actualizar cliente' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.json({ message: 'Cliente actualizado' });
    });
});

// Eliminar cliente
app.delete('/clientes/:id', (req, res) => {
    const sql = 'DELETE FROM clientes WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar cliente:', err);
            return res.status(500).json({ error: 'Error al eliminar cliente' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.json({ message: 'Cliente eliminado' });
    });
});

// ---------- Proveedores API ----------
// Tabla `proveedores`: id, empresa, nombre, telefono, correo_electronico, direccion

// Obtener todos los proveedores
app.get('/proveedores', (req, res) => {
    const sql = 'SELECT id, empresa, nombre, nit, telefono, correo_electronico AS correo, direccion FROM proveedores';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error al obtener proveedores:', err);
            return res.status(500).json({ error: 'Error al obtener proveedores' });
        }
        res.json(results);
    });
});

// Obtener proveedor por id
app.get('/proveedores/:id', (req, res) => {
    const sql = 'SELECT id, empresa, nombre, nit, telefono, correo_electronico AS correo, direccion FROM proveedores WHERE id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error al obtener proveedor:', err);
            return res.status(500).json({ error: 'Error al obtener proveedor' });
        }
        if (results.length === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
        res.json(results[0]);
    });
});

// Crear nuevo proveedor
app.post('/proveedores', (req, res) => {
    const { empresa, nombre, nit, telefono, correo, direccion } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre es requerido' });
    const telefonoSan = sanitizePhone(telefono);

    const sql = 'INSERT INTO proveedores (empresa, nombre, nit, telefono, correo_electronico, direccion) VALUES (?, ?, ?, ?, ?, ?)';
    db.query(sql, [empresa || null, nombre, nit || null, telefonoSan, correo || null, direccion || null], (err, result) => {
        if (err) {
            console.error('Error al crear proveedor:', err);
            return res.status(500).json({ error: 'Error al crear proveedor' });
        }
        res.status(201).json({ id: result.insertId, empresa, nombre, nit: nit || null, telefono: telefonoSan, correo, direccion });
    });
});

// Actualizar proveedor
app.put('/proveedores/:id', (req, res) => {
    const { empresa, nombre, nit, telefono, correo, direccion } = req.body;
    const telefonoSan = sanitizePhone(telefono);
    const sql = 'UPDATE proveedores SET empresa = ?, nombre = ?, nit = ?, telefono = ?, correo_electronico = ?, direccion = ? WHERE id = ?';
    db.query(sql, [empresa || null, nombre || null, nit || null, telefonoSan, correo || null, direccion || null, req.params.id], (err, result) => {
        if (err) {
            console.error('Error al actualizar proveedor:', err);
            return res.status(500).json({ error: 'Error al actualizar proveedor' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
        res.json({ message: 'Proveedor actualizado' });
    });
});

// Eliminar proveedor
app.delete('/proveedores/:id', (req, res) => {
    const sql = 'DELETE FROM proveedores WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar proveedor:', err);
            return res.status(500).json({ error: 'Error al eliminar proveedor' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
        res.json({ message: 'Proveedor eliminado' });
    });
});

// ---------- Productos API ----------
// Tabla `productos`: id, nombre, medida, precio, stock, descripcion, proveedor_id

// Obtener todos los productos
app.get('/productos', (req, res) => {
    const sql = 'SELECT id, nombre, medida, precio, stock, descripcion, proveedor_id FROM productos';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error al obtener productos:', err);
            return res.status(500).json({ error: 'Error al obtener productos' });
        }
        res.json(results);
    });
});

// Obtener producto por id
app.get('/productos/:id', (req, res) => {
    const sql = 'SELECT id, nombre, medida, precio, stock, descripcion, proveedor_id FROM productos WHERE id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error al obtener producto:', err);
            return res.status(500).json({ error: 'Error al obtener producto' });
        }
        if (results.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json(results[0]);
    });
});

// Crear nuevo producto
app.post('/productos', (req, res) => {
    const { nombre, medida, precio, stock, descripcion, proveedor_id } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre es requerido' });

    const sql = 'INSERT INTO productos (nombre, medida, precio, stock, descripcion, proveedor_id) VALUES (?, ?, ?, ?, ?, ?)';
    db.query(sql, [nombre, medida || null, precio || null, stock || null, descripcion || null, proveedor_id || null], (err, result) => {
        if (err) {
            console.error('Error al crear producto:', err);
            return res.status(500).json({ error: 'Error al crear producto' });
        }
        res.status(201).json({ id: result.insertId, nombre, medida, precio, stock, descripcion, proveedor_id });
    });
});

// Actualizar producto
app.put('/productos/:id', (req, res) => {
    const { nombre, medida, precio, stock, descripcion, proveedor_id } = req.body;
    const sql = 'UPDATE productos SET nombre = ?, medida = ?, precio = ?, stock = ?, descripcion = ?, proveedor_id = ? WHERE id = ?';
    db.query(sql, [nombre || null, medida || null, precio || null, stock || null, descripcion || null, proveedor_id || null, req.params.id], (err, result) => {
        if (err) {
            console.error('Error al actualizar producto:', err);
            return res.status(500).json({ error: 'Error al actualizar producto' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json({ message: 'Producto actualizado' });
    });
});

// Eliminar producto
app.delete('/productos/:id', (req, res) => {
    const sql = 'DELETE FROM productos WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar producto:', err);
            return res.status(500).json({ error: 'Error al eliminar producto' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json({ message: 'Producto eliminado' });
    });
});

// ---------- Compras API ----------
// Tabla `compras`: id, fecha, proveedor_id, total
app.get('/compras', (req, res) => {
    // Optional date range filters: fecha_inicio, fecha_fin in YYYY-MM-DD
    // Join with proveedores to include proveedor name
    let sql = 'SELECT compras.id, compras.fecha, compras.proveedor_id, proveedores.nombre AS proveedor, compras.monto FROM compras LEFT JOIN proveedores ON compras.proveedor_id = proveedores.id';
    const params = [];
    if (req.query.fecha_inicio && req.query.fecha_fin) {
        sql += ' WHERE compras.fecha BETWEEN ? AND ?';
        params.push(req.query.fecha_inicio, req.query.fecha_fin);
    } else if (req.query.fecha_inicio) {
        sql += ' WHERE compras.fecha >= ?';
        params.push(req.query.fecha_inicio);
    } else if (req.query.fecha_fin) {
        sql += ' WHERE compras.fecha <= ?';
        params.push(req.query.fecha_fin);
    }
    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error al obtener compras:', err);
            return res.status(500).json({ error: 'Error al obtener compras' });
        }
        res.json(results);
    });
});

app.get('/compras/:id', (req, res) => {
    const sql = 'SELECT compras.id, compras.fecha, compras.proveedor_id, proveedores.nombre AS proveedor, compras.monto FROM compras LEFT JOIN proveedores ON compras.proveedor_id = proveedores.id WHERE compras.id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error al obtener compra:', err);
            return res.status(500).json({ error: 'Error al obtener compra' });
        }
        if (results.length === 0) return res.status(404).json({ error: 'Compra no encontrada' });
        res.json(results[0]);
    });
});

app.post('/compras', (req, res) => {
    const { fecha, proveedor_id, total } = req.body;
    if (!fecha || !proveedor_id) return res.status(400).json({ error: 'fecha y proveedor_id son requeridos' });
    const sql = 'INSERT INTO compras (fecha, proveedor_id, monto) VALUES (?, ?, ?)';
    db.query(sql, [fecha, proveedor_id, total || 0], (err, result) => {
        if (err) {
            console.error('Error al crear compra:', err);
            return res.status(500).json({ error: 'Error al crear compra' });
        }
        res.status(201).json({ id: result.insertId, fecha, proveedor_id, total: total || 0 });
    });
});

app.put('/compras/:id', (req, res) => {
    const { fecha, proveedor_id, total } = req.body;
    const sql = 'UPDATE compras SET fecha = ?, proveedor_id = ?, monto = ? WHERE id = ?';
    db.query(sql, [fecha || null, proveedor_id || null, total || 0, req.params.id], (err, result) => {
        if (err) {
            console.error('Error al actualizar compra:', err);
            return res.status(500).json({ error: 'Error al actualizar compra' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Compra no encontrada' });
        res.json({ message: 'Compra actualizada' });
    });
});

app.delete('/compras/:id', (req, res) => {
    const sql = 'DELETE FROM compras WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar compra:', err);
            return res.status(500).json({ error: 'Error al eliminar compra' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Compra no encontrada' });
        res.json({ message: 'Compra eliminada' });
    });
});

// Detalle Compras
// Tabla `detalle_compras`: id, compra_id, producto_id, cantidad, precio_unitario, subtotal
app.get('/compras/:id/detalle', (req, res) => {
    const sql = 'SELECT detalle_compras.id, detalle_compras.compra_id, detalle_compras.producto_id, productos.nombre AS producto, detalle_compras.cantidad, detalle_compras.precio_unitario, detalle_compras.subtotal FROM detalle_compras LEFT JOIN productos ON detalle_compras.producto_id = productos.id WHERE detalle_compras.compra_id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error al obtener detalle de compra:', err);
            return res.status(500).json({ error: 'Error al obtener detalle de compra' });
        }
        res.json(results);
    });
});

app.post('/compras/:id/detalle', (req, res) => {
    const compraId = req.params.id;
    const { producto_id, cantidad, precio_unitario } = req.body;
    if (!producto_id || !cantidad) return res.status(400).json({ error: 'producto_id y cantidad son requeridos' });
    const subtotal = (precio_unitario || 0) * Number(cantidad);
    const sql = 'INSERT INTO detalle_compras (compra_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [compraId, producto_id, cantidad, precio_unitario || 0, subtotal], (err, result) => {
        if (err) {
            console.error('Error al crear detalle de compra:', err);
            return res.status(500).json({ error: 'Error al crear detalle de compra' });
        }
        res.status(201).json({ id: result.insertId, compra_id: compraId, producto_id, cantidad, precio_unitario, subtotal });
    });
});

app.put('/detalle-compras/:id', (req, res) => {
    const { producto_id, cantidad, precio_unitario } = req.body;
    const subtotal = (precio_unitario || 0) * Number(cantidad || 0);
    const sql = 'UPDATE detalle_compras SET producto_id = ?, cantidad = ?, precio_unitario = ?, subtotal = ? WHERE id = ?';
    db.query(sql, [producto_id || null, cantidad || 0, precio_unitario || 0, subtotal, req.params.id], (err, result) => {
        if (err) {
            console.error('Error al actualizar detalle de compra:', err);
            return res.status(500).json({ error: 'Error al actualizar detalle de compra' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Detalle no encontrado' });
        res.json({ message: 'Detalle de compra actualizado' });
    });
});

app.delete('/detalle-compras/:id', (req, res) => {
    const sql = 'DELETE FROM detalle_compras WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar detalle de compra:', err);
            return res.status(500).json({ error: 'Error al eliminar detalle de compra' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Detalle no encontrado' });
        res.json({ message: 'Detalle de compra eliminado' });
    });
});

// ---------- Ventas API ----------
// Tabla `ventas`: id, fecha, cliente_id, monto
app.get('/ventas', (req, res) => {
    // Join with clientes to include cliente name
    let sql = 'SELECT ventas.id, ventas.fecha, ventas.cliente_id, clientes.nombre AS cliente, ventas.monto, f.id AS factura_id FROM ventas LEFT JOIN clientes ON ventas.cliente_id = clientes.id LEFT JOIN facturacion f ON f.venta_id = ventas.id';
    const params = [];
    if (req.query.fecha_inicio && req.query.fecha_fin) {
        sql += ' WHERE ventas.fecha BETWEEN ? AND ?';
        params.push(req.query.fecha_inicio, req.query.fecha_fin);
    } else if (req.query.fecha_inicio) {
        sql += ' WHERE ventas.fecha >= ?';
        params.push(req.query.fecha_inicio);
    } else if (req.query.fecha_fin) {
        sql += ' WHERE ventas.fecha <= ?';
        params.push(req.query.fecha_fin);
    }
    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error al obtener ventas:', err);
            return res.status(500).json({ error: 'Error al obtener ventas' });
        }
        res.json(results);
    });
});

app.get('/ventas/:id', (req, res) => {
    const sql = 'SELECT ventas.id, ventas.fecha, ventas.cliente_id, clientes.nombre AS cliente, ventas.monto, f.id AS factura_id FROM ventas LEFT JOIN clientes ON ventas.cliente_id = clientes.id LEFT JOIN facturacion f ON f.venta_id = ventas.id WHERE ventas.id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error al obtener venta:', err);
            return res.status(500).json({ error: 'Error al obtener venta' });
        }
        if (results.length === 0) return res.status(404).json({ error: 'Venta no encontrada' });
        res.json(results[0]);
    });
});

app.post('/ventas', (req, res) => {
    const { fecha, cliente_id, monto } = req.body;
    if (!fecha || !cliente_id) return res.status(400).json({ error: 'fecha y cliente_id son requeridos' });
    const sql = 'INSERT INTO ventas (fecha, cliente_id, monto) VALUES (?, ?, ?)';
    db.query(sql, [fecha, cliente_id, monto || 0], (err, result) => {
        if (err) {
            console.error('Error al crear venta:', err);
            return res.status(500).json({ error: 'Error al crear venta' });
        }
        res.status(201).json({ id: result.insertId, fecha, cliente_id, monto: monto || 0 });
    });
});

app.put('/ventas/:id', (req, res) => {
    const { fecha, cliente_id, monto } = req.body;
    const sql = 'UPDATE ventas SET fecha = ?, cliente_id = ?, monto = ? WHERE id = ?';
    db.query(sql, [fecha || null, cliente_id || null, monto || 0, req.params.id], (err, result) => {
        if (err) {
            console.error('Error al actualizar venta:', err);
            return res.status(500).json({ error: 'Error al actualizar venta' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Venta no encontrada' });
        res.json({ message: 'Venta actualizada' });
    });
});

app.delete('/ventas/:id', (req, res) => {
    const sql = 'DELETE FROM ventas WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar venta:', err);
            return res.status(500).json({ error: 'Error al eliminar venta' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Venta no encontrada' });
        res.json({ message: 'Venta eliminada' });
    });
});

// Detalle Ventas
// Tabla `detalle_ventas`: id, venta_id, producto_id, cantidad, precio_unitario, subtotal
app.get('/ventas/:id/detalle', (req, res) => {
    const sql = 'SELECT detalle_ventas.id, detalle_ventas.venta_id, detalle_ventas.producto_id, productos.nombre AS producto, detalle_ventas.cantidad, detalle_ventas.precio_unitario, detalle_ventas.subtotal FROM detalle_ventas LEFT JOIN productos ON detalle_ventas.producto_id = productos.id WHERE detalle_ventas.venta_id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error al obtener detalle de venta:', err);
            return res.status(500).json({ error: 'Error al obtener detalle de venta' });
        }
        res.json(results);
    });
});

app.post('/ventas/:id/detalle', (req, res) => {
    const ventaId = req.params.id;
    const { producto_id, cantidad, precio_unitario } = req.body;
    if (!producto_id || !cantidad) return res.status(400).json({ error: 'producto_id y cantidad son requeridos' });
    const subtotal = (precio_unitario || 0) * Number(cantidad);
    const sql = 'INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [ventaId, producto_id, cantidad, precio_unitario || 0, subtotal], (err, result) => {
        if (err) {
            console.error('Error al crear detalle de venta:', err);
            return res.status(500).json({ error: 'Error al crear detalle de venta' });
        }
        res.status(201).json({ id: result.insertId, venta_id: ventaId, producto_id, cantidad, precio_unitario, subtotal });
    });
});

app.put('/detalle-ventas/:id', (req, res) => {
    const { producto_id, cantidad, precio_unitario } = req.body;
    const subtotal = (precio_unitario || 0) * Number(cantidad || 0);
    const sql = 'UPDATE detalle_ventas SET producto_id = ?, cantidad = ?, precio_unitario = ?, subtotal = ? WHERE id = ?';
    db.query(sql, [producto_id || null, cantidad || 0, precio_unitario || 0, subtotal, req.params.id], (err, result) => {
        if (err) {
            console.error('Error al actualizar detalle de venta:', err);
            return res.status(500).json({ error: 'Error al actualizar detalle de venta' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Detalle no encontrado' });
        res.json({ message: 'Detalle de venta actualizado' });
    });
});

app.delete('/detalle-ventas/:id', (req, res) => {
    const sql = 'DELETE FROM detalle_ventas WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar detalle de venta:', err);
            return res.status(500).json({ error: 'Error al eliminar detalle de venta' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Detalle no encontrado' });
        res.json({ message: 'Detalle de venta eliminado' });
    });
});

// ---------- Inventarios API ----------
// Tabla `inventarios`: id, producto_id, cantidad, ubicacion
app.get('/inventarios', (req, res) => {
    const sql = 'SELECT id, producto_id, cantidad, ubicacion FROM inventarios';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error al obtener inventarios:', err);
            return res.status(500).json({ error: 'Error al obtener inventarios' });
        }
        res.json(results);
    });
});

app.get('/inventarios/:id', (req, res) => {
    const sql = 'SELECT id, producto_id, cantidad, ubicacion FROM inventarios WHERE id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error al obtener inventario:', err);
            return res.status(500).json({ error: 'Error al obtener inventario' });
        }
        if (results.length === 0) return res.status(404).json({ error: 'Inventario no encontrado' });
        res.json(results[0]);
    });
});

app.post('/inventarios', (req, res) => {
    const { producto_id, cantidad, ubicacion } = req.body;
    if (!producto_id) return res.status(400).json({ error: 'producto_id es requerido' });
    const sql = 'INSERT INTO inventarios (producto_id, cantidad, ubicacion) VALUES (?, ?, ?)';
    db.query(sql, [producto_id, cantidad || 0, ubicacion || null], (err, result) => {
        if (err) {
            console.error('Error al crear inventario:', err);
            return res.status(500).json({ error: 'Error al crear inventario' });
        }
        res.status(201).json({ id: result.insertId, producto_id, cantidad: cantidad || 0, ubicacion: ubicacion || null });
    });
});

app.put('/inventarios/:id', (req, res) => {
    const { producto_id, cantidad, ubicacion } = req.body;
    const sql = 'UPDATE inventarios SET producto_id = ?, cantidad = ?, ubicacion = ? WHERE id = ?';
    db.query(sql, [producto_id || null, cantidad || 0, ubicacion || null, req.params.id], (err, result) => {
        if (err) {
            console.error('Error al actualizar inventario:', err);
            return res.status(500).json({ error: 'Error al actualizar inventario' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Inventario no encontrado' });
        res.json({ message: 'Inventario actualizado' });
    });
});

app.delete('/inventarios/:id', (req, res) => {
    const sql = 'DELETE FROM inventarios WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar inventario:', err);
            return res.status(500).json({ error: 'Error al eliminar inventario' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Inventario no encontrado' });
        res.json({ message: 'Inventario eliminado' });
    });
});

// ---------- Facturacion API ----------
// Tabla `facturacion`: id, fecha, cliente_id

// Obtener todas las facturas (incluir nombre de cliente)
app.get('/facturacion', (req, res) => {
    // Include a precomputed monto (sum of cantidad * precio_unitario) per factura
    let sql = 'SELECT f.id, f.fecha, f.cliente_id, f.venta_id, CONCAT(c.nombre, " ", IFNULL(c.apellido, "")) AS cliente, COALESCE(t.monto, 0) AS monto '
            + 'FROM facturacion f '
            + 'LEFT JOIN clientes c ON f.cliente_id = c.id '
            + 'LEFT JOIN (SELECT facturacion_id, SUM(cantidad * precio_unitario) AS monto FROM detallefacturacion GROUP BY facturacion_id) t ON f.id = t.facturacion_id';
    const params = [];
    if (req.query.cliente_id) {
        sql += ' WHERE f.cliente_id = ?';
        params.push(req.query.cliente_id);
    }
    // Compare only the DATE portion so filters are inclusive of the full day
    if (req.query.fecha_inicio && req.query.fecha_fin) {
        sql += params.length ? ' AND DATE(f.fecha) BETWEEN ? AND ?' : ' WHERE DATE(f.fecha) BETWEEN ? AND ?';
        params.push(req.query.fecha_inicio, req.query.fecha_fin);
    } else if (req.query.fecha_inicio) {
        sql += params.length ? ' AND DATE(f.fecha) >= ?' : ' WHERE DATE(f.fecha) >= ?';
        params.push(req.query.fecha_inicio);
    } else if (req.query.fecha_fin) {
        sql += params.length ? ' AND DATE(f.fecha) <= ?' : ' WHERE DATE(f.fecha) <= ?';
        params.push(req.query.fecha_fin);
    }
    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error al obtener facturas:', err);
            return res.status(500).json({ error: 'Error al obtener facturas' });
        }
        res.json(results);
    });
});

// Obtener factura por id con cliente y items (detallefacturacion)
app.get('/facturacion/:id', (req, res) => {
    const id = req.params.id;
    // Note: some DBs may not have an 'observaciones' column; avoid selecting it directly to prevent ER_BAD_FIELD_ERROR
    const sql = `SELECT f.id, f.fecha, f.cliente_id, c.empresa, c.nombre AS cliente_nombre, c.apellido, c.nit, c.telefono, c.correo_electronico AS correo, c.direccion
                 FROM facturacion f
                 LEFT JOIN clientes c ON f.cliente_id = c.id
                 WHERE f.id = ?`;
    db.query(sql, [id], (err, results) => {
        if (err) {
            console.error('Error al obtener factura:', err);
            return res.status(500).json({ error: 'Error al obtener factura' });
        }
        if (results.length === 0) return res.status(404).json({ error: 'Factura no encontrada' });
        const factura = results[0];

        const sqlItems = `SELECT d.id, d.facturacion_id AS factura_id, d.producto_id, p.nombre AS descripcion, p.medida, d.cantidad, d.precio_unitario
                          FROM detallefacturacion d
                          LEFT JOIN productos p ON d.producto_id = p.id
                          WHERE d.facturacion_id = ?`;
        db.query(sqlItems, [id], (err2, items) => {
            if (err2) {
                console.error('Error al obtener items de factura:', err2);
                return res.status(500).json({ error: 'Error al obtener items de factura' });
            }
            // compute monto (sum of cantidad * precio_unitario) for this factura
            const sqlMonto = 'SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS monto FROM detallefacturacion WHERE facturacion_id = ?';
            db.query(sqlMonto, [id], (errM, rowsM) => {
                if (errM) {
                    console.error('Error calculando monto de factura:', errM);
                    return res.status(500).json({ error: 'Error al obtener monto de factura' });
                }
                const monto = (rowsM && rowsM[0] && rowsM[0].monto) ? Number(rowsM[0].monto) : 0;
                // shape response to match frontend expectations
                const response = {
                    id: factura.id,
                    fecha: factura.fecha,
                    monto,
                    venta_id: factura.venta_id || null,
                    // if the DB has an observaciones column it wasn't selected; default to empty string
                    observaciones: factura.observaciones || '',
                    cliente: {
                        empresa: factura.empresa || '',
                        nombre: factura.cliente_nombre || '',
                        apellido: factura.apellido || '',
                        nit: factura.nit || '',
                        telefono: factura.telefono || '',
                        correo: factura.correo || '',
                        direccion: factura.direccion || ''
                    },
                    items: items.map(it => ({ id: it.id, producto_id: it.producto_id, descripcion: it.descripcion, medida: it.medida, cantidad: it.cantidad, precio_unitario: it.precio_unitario }))
                };
                res.json(response);
            });
        });
    });
});

// Listar items de una factura
app.get('/facturacion/:id/detalle', (req, res) => {
    const id = req.params.id;
    const sql = `SELECT d.id, d.facturacion_id AS factura_id, d.producto_id, p.nombre AS descripcion, p.medida, d.cantidad, d.precio_unitario
                 FROM detallefacturacion d
                 LEFT JOIN productos p ON d.producto_id = p.id
                 WHERE d.facturacion_id = ?`;
    db.query(sql, [id], (err, results) => {
        if (err) {
            console.error('Error al obtener detalle de factura:', err);
            return res.status(500).json({ error: 'Error al obtener detalle de factura' });
        }
        res.json(results);
    });
});

// Agregar item a una factura
app.post('/facturacion/:id/detalle', (req, res) => {
    const facturaId = req.params.id;
    const { producto_id, cantidad, precio_unitario } = req.body;
    if (!producto_id || !cantidad) return res.status(400).json({ error: 'producto_id y cantidad son requeridos' });
    // Prevent duplicate producto per factura
    const sqlCheck = 'SELECT COUNT(*) AS cnt FROM detallefacturacion WHERE facturacion_id = ? AND producto_id = ?';
    db.query(sqlCheck, [facturaId, producto_id], (errChk, rowsChk) => {
        if (errChk) {
            console.error('Error comprobando duplicados en detalle de factura:', errChk);
            return res.status(500).json({ error: 'Error interno' });
        }
        if (rowsChk && rowsChk[0] && rowsChk[0].cnt > 0) {
            return res.status(400).json({ error: 'Producto ya agregado a esta factura' });
        }
        const sql = 'INSERT INTO detallefacturacion (facturacion_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)';
        db.query(sql, [facturaId, producto_id, cantidad, precio_unitario || 0], (err, result) => {
            if (err) {
                console.error('Error al crear detalle de factura:', err);
                return res.status(500).json({ error: 'Error al crear detalle de factura' });
            }
            // sync monto -> ventas
            syncFacturaVentaMonto(facturaId);
            res.status(201).json({ id: result.insertId, facturacion_id: facturaId, producto_id, cantidad, precio_unitario: precio_unitario || 0 });
        });
    });
});

// Actualizar un item de factura (detallefacturacion)
app.put('/detallefacturacion/:id', (req, res) => {
    const { producto_id, cantidad, precio_unitario } = req.body;
    const itemId = req.params.id;
    const subtotal = (precio_unitario || 0) * Number(cantidad || 0);
    // First get the factura id for this item
    const sqlGet = 'SELECT facturacion_id FROM detallefacturacion WHERE id = ?';
    db.query(sqlGet, [itemId], (errGet, rowsGet) => {
        if (errGet) {
            console.error('Error al obtener detalle de factura:', errGet);
            return res.status(500).json({ error: 'Error interno' });
        }
        if (!rowsGet || rowsGet.length === 0) return res.status(404).json({ error: 'Detalle no encontrado' });
        const facturaId = rowsGet[0].facturacion_id;
        // If producto_id is provided, ensure no other line in the same factura uses it
        if (producto_id) {
            const sqlCheck = 'SELECT COUNT(*) AS cnt FROM detallefacturacion WHERE facturacion_id = ? AND producto_id = ? AND id != ?';
            db.query(sqlCheck, [facturaId, producto_id, itemId], (errChk, rowsChk) => {
                if (errChk) {
                    console.error('Error comprobando duplicados en detalle de factura:', errChk);
                    return res.status(500).json({ error: 'Error interno' });
                }
                if (rowsChk && rowsChk[0] && rowsChk[0].cnt > 0) {
                    return res.status(400).json({ error: 'Producto ya agregado a esta factura en otra línea' });
                }
                const sql = 'UPDATE detallefacturacion SET producto_id = ?, cantidad = ?, precio_unitario = ? WHERE id = ?';
                db.query(sql, [producto_id || null, cantidad || 0, precio_unitario || 0, itemId], (errUpd, resultUpd) => {
                    if (errUpd) {
                        console.error('Error al actualizar detalle de factura:', errUpd);
                        return res.status(500).json({ error: 'Error al actualizar detalle de factura' });
                    }
                    if (resultUpd.affectedRows === 0) return res.status(404).json({ error: 'Detalle no encontrado' });
                    // sync monto
                    db.query('SELECT facturacion_id FROM detallefacturacion WHERE id = ?', [itemId], (e2, r2) => {
                        if (!e2 && r2 && r2[0]) syncFacturaVentaMonto(r2[0].facturacion_id);
                    });
                    res.json({ message: 'Detalle de factura actualizado' });
                });
            });
        } else {
            // No producto change, just update the row
            const sql = 'UPDATE detallefacturacion SET producto_id = ?, cantidad = ?, precio_unitario = ? WHERE id = ?';
            db.query(sql, [producto_id || null, cantidad || 0, precio_unitario || 0, itemId], (errUpd, resultUpd) => {
                if (errUpd) {
                    console.error('Error al actualizar detalle de factura:', errUpd);
                    return res.status(500).json({ error: 'Error al actualizar detalle de factura' });
                }
                if (resultUpd.affectedRows === 0) return res.status(404).json({ error: 'Detalle no encontrado' });
                res.json({ message: 'Detalle de factura actualizado' });
            });
        }
    });
});

// Eliminar un item de factura
app.delete('/detallefacturacion/:id', (req, res) => {
    const itemId = req.params.id;
    // capture factura_id before deleting to sync monto afterwards
    db.query('SELECT facturacion_id FROM detallefacturacion WHERE id = ?', [itemId], (errSelect, rowsSel) => {
        if (errSelect) {
            console.error('Error obteniendo detalle antes de eliminar:', errSelect);
            return res.status(500).json({ error: 'Error interno' });
        }
        const facturaId = rowsSel && rowsSel[0] ? rowsSel[0].facturacion_id : null;
        const sql = 'DELETE FROM detallefacturacion WHERE id = ?';
        db.query(sql, [itemId], (err, result) => {
            if (err) {
                console.error('Error al eliminar detalle de factura:', err);
                return res.status(500).json({ error: 'Error al eliminar detalle de factura' });
            }
            if (result.affectedRows === 0) return res.status(404).json({ error: 'Detalle no encontrado' });
            if (facturaId) syncFacturaVentaMonto(facturaId);
            res.json({ message: 'Detalle de factura eliminado' });
        });
    });
});

// Crear nueva factura
app.post('/facturacion', (req, res) => {
    const { fecha, cliente_id } = req.body;
    if (!fecha || !cliente_id) return res.status(400).json({ error: 'fecha y cliente_id son requeridos' });
    const sql = 'INSERT INTO facturacion (fecha, cliente_id) VALUES (?, ?)';
    db.query(sql, [fecha, cliente_id], (err, result) => {
        if (err) {
            console.error('Error al crear factura:', err);
            return res.status(500).json({ error: 'Error al crear factura' });
        }
        const newId = result.insertId;
        // create/sync venta record (will create ventas row and update factura.venta_id)
        syncFacturaVentaMonto(newId);
        res.status(201).json({ id: newId, fecha, cliente_id, venta_id: null });
    });
});

// Eliminar factura
app.delete('/facturacion/:id', (req, res) => {
    const facturaId = req.params.id;
    // Use a transaction to remove detalle rows first to avoid FK constraint errors
    db.beginTransaction(errTx => {
        if (errTx) {
            console.error('Transaction start error:', errTx);
            return res.status(500).json({ error: 'Error interno' });
        }
        const sqlDelItems = 'DELETE FROM detallefacturacion WHERE facturacion_id = ?';
        db.query(sqlDelItems, [facturaId], (err1) => {
            if (err1) {
                console.error('Error al eliminar items de factura:', err1);
                return db.rollback(() => res.status(500).json({ error: 'Error al eliminar items de factura' }));
            }
            const sql = 'DELETE FROM facturacion WHERE id = ?';
            db.query(sql, [facturaId], (err2, result) => {
                if (err2) {
                    console.error('Error al eliminar factura:', err2);
                    return db.rollback(() => res.status(500).json({ error: 'Error al eliminar factura' }));
                }
                if (result.affectedRows === 0) {
                    return db.rollback(() => res.status(404).json({ error: 'Factura no encontrada' }));
                }
                db.commit(commitErr => {
                    if (commitErr) {
                        console.error('Commit error:', commitErr);
                        return db.rollback(() => res.status(500).json({ error: 'Error interno' }));
                    }
                    res.json({ message: 'Factura eliminada' });
                });
            });
        });
    });
});

app.listen(8081, () => {
    console.log('Server is running on port 8081');
});
 