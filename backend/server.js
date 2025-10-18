const express = require('express');
const mysql = require('mysql');
const cors = require('cors');


const app = express();
app.use(express.json());
app.use(cors());

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crud'
})

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
    const sql = 'SELECT id, empresa, nombre, apellido, telefono, correo_electronico AS correo, direccion FROM clientes';
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
    const sql = 'SELECT id, empresa, nombre, apellido, telefono, correo_electronico AS correo, direccion FROM clientes WHERE id = ?';
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
    const { empresa, nombre, apellido, telefono, correo, direccion } = req.body;
    if (!nombre || !apellido) return res.status(400).json({ error: 'Nombre y apellido son requeridos' });

    const sql = 'INSERT INTO clientes (empresa, nombre, apellido, telefono, correo_electronico, direccion) VALUES (?, ?, ?, ?, ?, ?)';
    db.query(sql, [empresa || null, nombre, apellido, telefono || null, correo || null, direccion || null], (err, result) => {
        if (err) {
            console.error('Error al crear cliente:', err);
            return res.status(500).json({ error: 'Error al crear cliente' });
        }
        res.status(201).json({ id: result.insertId, empresa, nombre, apellido, telefono, correo, direccion });
    });
});

// Actualizar cliente
app.put('/clientes/:id', (req, res) => {
    const { empresa, nombre, apellido, telefono, correo, direccion } = req.body;
    const sql = 'UPDATE clientes SET empresa = ?, nombre = ?, apellido = ?, telefono = ?, correo_electronico = ?, direccion = ? WHERE id = ?';
    db.query(sql, [empresa || null, nombre || null, apellido || null, telefono || null, correo || null, direccion || null, req.params.id], (err, result) => {
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
    const sql = 'DELETE FROM clientes WHERE `Id` = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar cliente:', err);
            return res.status(500).json({ error: 'Error al eliminar cliente' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.json({ message: 'Cliente eliminado' });
    });
});

app.listen(8081, () => {
    console.log('Server is running on port 8081');
});
 